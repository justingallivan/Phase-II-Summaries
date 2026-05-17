#!/usr/bin/env node
/**
 * Reviewer Manager → Dataverse design input (READ-ONLY): the 87
 * `akoya_program = "Research Reviewer"` rows are paid-peer-reviewer
 * tracking (user, S158). Open design question: how is the *person*
 * (the reviewer) represented? Is it a `contact`? Something else?
 *
 * For a sample of those requests: dump every populated field with its
 * lookup target entity (field-dictionary style); then for any lookup
 * that targets `contact`, pull that contact's identity fields so we can
 * see whether reviewers live in `contact` (and how they'd join the
 * existing Reviewer Finder / Review Manager reviewer model).
 *
 * Only POST is the OAuth token; every Dataverse call is a GET.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^"(.*)"$/, '$1');
    if (!process.env[k]) process.env[k] = v;
  }
}

async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.DYNAMICS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: process.env.DYNAMICS_CLIENT_ID,
      client_secret: process.env.DYNAMICS_CLIENT_SECRET, scope: `${process.env.DYNAMICS_URL}/.default`,
    }),
  });
  if (!r.ok) throw new Error(`Token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function get(token, urlPath) {
  let next = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const rows = [];
  while (next) {
    const r = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });
    const t = await r.text();
    let body; try { body = JSON.parse(t); } catch { body = t; }
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 240) : JSON.stringify(body).slice(0, 240)}`);
    if (body.value) { for (const v of body.value) rows.push(v); next = body['@odata.nextLink']; }
    else return body;
  }
  return { value: rows };
}

const FV = '@OData.Community.Display.V1.FormattedValue';
const LLN = '@Microsoft.Dynamics.CRM.lookuplogicalname';

(async () => {
  const token = await getToken();
  console.log(`Reviewer linkage probe — ${new Date().toISOString()} (read-only)\n`);

  // resolve the Research Reviewer program id
  const progs = await get(token,
    `/akoya_programs?$select=akoya_programid,akoya_program&$filter=${encodeURIComponent("akoya_program eq 'Research Reviewer'")}`);
  if (!progs.value.length) { console.log('no Research Reviewer program — STOP'); process.exit(0); }
  const pid = progs.value[0].akoya_programid;

  // a sample of the reviewer requests — FULL records (no $select ⇒ all fields)
  const sample = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`_akoya_programid_value eq ${pid}`)}&$top=5&$orderby=createdon asc`)).value;
  console.log(`Sampling ${sample.length} of the 87 Research Reviewer requests (full field dump)\n`);

  const contactLookups = new Set();
  for (const row of sample) {
    console.log(`══ #${row.akoya_requestnum}  (created ${row.createdon}) ══`);
    const lookups = [], scalars = [];
    for (const [k, v] of Object.entries(row)) {
      if (k.includes('@') || k === '@odata.etag') continue;
      if (v === null || v === undefined || v === '') continue;
      if (k.startsWith('_') && k.endsWith('_value')) {
        const tgt = row[`${k}${LLN}`] || '?';
        lookups.push({ field: k.slice(1, -6), target: tgt, value: row[`${k}${FV}`] || v });
        if (tgt === 'contact') contactLookups.add(k.slice(1, -6));
      } else if (typeof v !== 'object') {
        scalars.push(`${k}=${row[`${k}${FV}`] !== undefined ? `${v} (${row[`${k}${FV}`]})` : v}`);
      }
    }
    console.log('  LOOKUPS:');
    for (const l of lookups.sort((a, b) => a.field.localeCompare(b.field))) {
      console.log(`    ${l.field}  →  [${l.target}]  = ${l.value}`);
    }
    console.log(`  SCALARS (${scalars.length}): ${scalars.join(' · ')}`);
    console.log();
  }

  console.log(`══ Contact-targeted lookups found: ${[...contactLookups].join(', ') || '(none)'} ══`);
  if (contactLookups.size) {
    const ids = new Set();
    for (const row of sample) for (const lk of contactLookups) { const v = row[`_${lk}_value`]; if (v) ids.add(v); }
    console.log(`Resolving ${ids.size} distinct contact id(s) to see how reviewers are modelled in \`contact\`:\n`);
    for (const cid of [...ids].slice(0, 8)) {
      try {
        const c = await get(token,
          `/contacts(${cid})?$select=contactid,fullname,emailaddress1,jobtitle,statecode,statuscode,createdon,_parentcustomerid_value`);
        console.log(`  contact ${cid}`);
        console.log(`    fullname=${c.fullname || '—'}  email=${c.emailaddress1 || '—'}  jobtitle=${c.jobtitle || '—'}`);
        console.log(`    state=${c[`statecode${FV}`] ?? c.statecode}  status=${c[`statuscode${FV}`] ?? c.statuscode}  created=${c.createdon}  parentAccount=${c[`_parentcustomerid_value${FV}`] || '—'}`);
      } catch (e) { console.log(`  contact ${cid}: ${e.message}`); }
    }
  }
  console.log('\nINTERPRETATION: if the reviewer person resolves to a real `contact` (email/jobtitle/parent-org),');
  console.log('then Reviewer Manager → Dataverse should key on `contact`, not a new entity, and reconcile');
  console.log('against the existing Reviewer Finder pool (Postgres `researchers`) + program-director-resolver.');
  console.log('\nDone (read-only reviewer-linkage probe).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
