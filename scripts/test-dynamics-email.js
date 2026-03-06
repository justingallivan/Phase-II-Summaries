#!/usr/bin/env node

/**
 * Test script: Verify Dynamics 365 Email Activity creation and sending.
 *
 * Tests:
 * 1. Create an email activity with the SendEmail action
 * 2. Optionally send it (pass --send flag)
 *
 * Usage:
 *   node scripts/test-dynamics-email.js                    # Create only (draft)
 *   node scripts/test-dynamics-email.js --send             # Create and send
 *   node scripts/test-dynamics-email.js --send --to user@example.com
 *
 * Requires: .env.local with DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env and .env.local
for (const envFile of ['.env', '.env.local']) {
  try {
    const content = readFileSync(resolve(process.cwd(), envFile), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {}
}

const { DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET } = process.env;

if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
  console.error('Missing Dynamics environment variables');
  process.exit(1);
}

const args = process.argv.slice(2);
const shouldSend = args.includes('--send');
const toIdx = args.indexOf('--to');
const toEmail = toIdx >= 0 ? args[toIdx + 1] : null;

const FROM_EMAIL = 'jgallivan@wmkeck.org'; // Default sender
const TO_EMAIL = toEmail || FROM_EMAIL; // Default: send to self

async function getToken() {
  const tokenUrl = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: DYNAMICS_CLIENT_ID,
    client_secret: DYNAMICS_CLIENT_SECRET,
    scope: `${DYNAMICS_URL}/.default`,
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`Token request failed: ${resp.status}`);
  const data = await resp.json();
  return data.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function main() {
  console.log(`\n=== Dynamics Email Activity Test ===\n`);
  console.log(`From: ${FROM_EMAIL}`);
  console.log(`To: ${TO_EMAIL}`);
  console.log(`Mode: ${shouldSend ? 'CREATE + SEND' : 'CREATE ONLY (draft)'}\n`);

  const token = await getToken();
  console.log('Authenticated to Dynamics\n');

  // Step 1: Create email activity
  console.log('--- Step 1: Create Email Activity ---');

  const emailData = {
    subject: '[TEST] Dynamics Email Activity - Test from App Suite',
    description: '<p>This is a <strong>test email</strong> sent via the Dynamics 365 Email Activities API.</p><p>If you received this, the integration is working correctly.</p>',
    directioncode: true, // Outgoing
    email_activity_parties: [
      { participationtypemask: 1, addressused: FROM_EMAIL },
      { participationtypemask: 2, addressused: TO_EMAIL },
    ],
  };

  const createResp = await fetch(`${DYNAMICS_URL}/api/data/v9.2/emails`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(emailData),
  });

  if (!createResp.ok) {
    const text = await createResp.text();
    console.error(`FAILED to create email (${createResp.status}): ${text}`);
    process.exit(1);
  }

  const created = await createResp.json();
  const emailId = created.activityid;
  console.log(`  Email Activity ID: ${emailId}`);
  console.log(`  Status: ${created.statuscode} (${created.statecode === 0 ? 'Draft' : 'Other'})\n`);

  if (!shouldSend) {
    console.log('Draft created. Pass --send to also send the email.');
    console.log('\n=== Done ===\n');
    return;
  }

  // Step 2: Send the email
  console.log('--- Step 2: Send Email (SendEmail action) ---');

  const sendResp = await fetch(`${DYNAMICS_URL}/api/data/v9.2/emails(${emailId})/Microsoft.Dynamics.CRM.SendEmail`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      IssueSend: true,
    }),
  });

  if (!sendResp.ok) {
    const text = await sendResp.text();
    console.error(`FAILED to send email (${sendResp.status}): ${text}`);
    console.log('\nCommon issues:');
    console.log('  - Service principal may not have prvSendEmail privilege');
    console.log('  - Sender mailbox may not have Server-Side Synchronization configured');
    console.log('  - Sender email may not match a valid system user or queue');
    process.exit(1);
  }

  console.log(`  Email sent successfully!`);

  // Step 3: Verify status
  console.log('\n--- Step 3: Verify Email Status ---');
  const verifyResp = await fetch(
    `${DYNAMICS_URL}/api/data/v9.2/emails(${emailId})?$select=subject,statuscode,statecode`,
    { headers: headers(token) }
  );

  if (verifyResp.ok) {
    const verified = await verifyResp.json();
    console.log(`  Subject: ${verified.subject}`);
    console.log(`  State: ${verified.statecode} (1 = Completed)`);
    console.log(`  Status: ${verified.statuscode} (3 = Sent, 6 = Pending Send)`);
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
