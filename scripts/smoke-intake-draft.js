#!/usr/bin/env node
/**
 * Smoke test for IntakeDraftService and IntakeAuditService.
 * Exercises upsert/get/list/append/remove/delete + audit logging
 * against the local Postgres. Cleans up after itself.
 *
 * Usage: node scripts/smoke-intake-draft.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [k, ...rest] = t.split('=');
    if (!k || !rest.length) continue;
    let v = rest.join('=');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

const { sql } = require('@vercel/postgres');
const IntakeDraftService = require('../lib/services/intake-draft-service');
const IntakeAuditService = require('../lib/services/intake-audit-service');

const ACCOUNT = '00000000-0000-0000-0000-000000000aaa';
const REQUEST = '00000000-0000-0000-0000-000000000bbb';
const CONTACT_OID = 'smoke-test-oid-' + Date.now();
const FORM_KEY = 'phase-ii-research-2026-06';

async function cleanup() {
  await sql`DELETE FROM intake_drafts WHERE account_id = ${ACCOUNT}`;
  await sql`DELETE FROM intake_audit WHERE actor_oid = ${CONTACT_OID}`;
}

function check(label, cond, ...details) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`, ...details);
    process.exitCode = 1;
  }
}

(async () => {
  try {
    await cleanup();

    console.log('1. upsert (insert path, with request_id)');
    const created = await IntakeDraftService.upsert({
      contactOid: CONTACT_OID,
      accountId: ACCOUNT,
      requestId: REQUEST,
      formKey: FORM_KEY,
      draftJson: { title: 'first' },
      attachments: [],
    });
    check('row created', !!created?.id);
    check('draft_json.title=first', created.draft_json.title === 'first');

    console.log('2. upsert again with same key updates in place');
    const updated = await IntakeDraftService.upsert({
      contactOid: CONTACT_OID,
      accountId: ACCOUNT,
      requestId: REQUEST,
      formKey: FORM_KEY,
      draftJson: { title: 'second' },
      attachments: [],
    });
    check('same row id (no duplicate)', updated.id === created.id);
    check('draft_json.title=second', updated.draft_json.title === 'second');

    console.log('3. getByKey round-trip');
    const fetched = await IntakeDraftService.getByKey({
      accountId: ACCOUNT,
      requestId: REQUEST,
      formKey: FORM_KEY,
    });
    check('fetched matches', fetched?.id === created.id);

    console.log('4. appendAttachment');
    const a1 = { filename: 'a.pdf', blob_url: 'blob://a', sha256: 'aa', size: 100, uploaded_at: new Date().toISOString() };
    const a2 = { filename: 'b.pdf', blob_url: 'blob://b', sha256: 'bb', size: 200, uploaded_at: new Date().toISOString() };
    await IntakeDraftService.appendAttachment(created.id, a1);
    const afterAppend = await IntakeDraftService.appendAttachment(created.id, a2);
    check('attachments has 2', afterAppend.attachments.length === 2);
    check('first is a.pdf', afterAppend.attachments[0].filename === 'a.pdf');

    console.log('5. removeAttachment by blob_url');
    const afterRemove = await IntakeDraftService.removeAttachment(created.id, 'blob://a');
    check('attachments has 1', afterRemove.attachments.length === 1);
    check('remaining is b.pdf', afterRemove.attachments[0].filename === 'b.pdf');

    console.log('6. listByContact / listByAccount');
    const byContact = await IntakeDraftService.listByContact(CONTACT_OID);
    check('listByContact returns 1', byContact.length === 1);
    const byAccount = await IntakeDraftService.listByAccount(ACCOUNT);
    check('listByAccount returns 1', byAccount.length === 1);

    console.log('7. second draft against the same account but a different request_id');
    const REQUEST_2 = '00000000-0000-0000-0000-000000000ccc';
    const second = await IntakeDraftService.upsert({
      contactOid: CONTACT_OID,
      accountId: ACCOUNT,
      requestId: REQUEST_2,
      formKey: FORM_KEY,
      draftJson: { title: 'sibling' },
      attachments: [],
    });
    check('sibling row got distinct id', second.id !== created.id);
    const byAccount2 = await IntakeDraftService.listByAccount(ACCOUNT);
    check('listByAccount now returns 2', byAccount2.length === 2);

    console.log('8. audit log + retrieval');
    const auditId = await IntakeAuditService.log({
      actorOid: CONTACT_OID,
      actorType: 'applicant',
      action: 'draft.upsert',
      targetEntity: 'intake_drafts',
      targetId: String(created.id),
      payload: { title: 'second' },
      metadata: { ip: '127.0.0.1' },
    });
    check('audit row inserted', !!auditId);

    const auditRows = await IntakeAuditService.queryByActor(CONTACT_OID);
    check('audit queryable', auditRows.length === 1);
    check('payload_digest is sha256-hex', /^[0-9a-f]{64}$/.test(auditRows[0].payload_digest));
    check('payload bytes NOT stored', !('payload' in auditRows[0]));

    console.log('9. invalid actorType returns null without throwing');
    const bad = await IntakeAuditService.log({ actorType: 'nonsense', action: 'x' });
    check('bad actorType → null', bad === null);

    console.log('10. delete + listByContact empty');
    await IntakeDraftService.delete(created.id);
    await IntakeDraftService.delete(second.id);
    const empty = await IntakeDraftService.listByContact(CONTACT_OID);
    check('listByContact returns 0 after delete', empty.length === 0);

    await cleanup();
    if (process.exitCode) {
      console.log('\nFAIL');
    } else {
      console.log('\nOK');
    }
    process.exit(process.exitCode || 0);
  } catch (e) {
    console.error('threw:', e.message);
    console.error(e.stack);
    await cleanup().catch(() => {});
    process.exit(1);
  }
})();
