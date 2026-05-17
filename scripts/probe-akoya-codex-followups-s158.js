#!/usr/bin/env node
/**
 * S158 Codex-review follow-ups (READ-ONLY) — closes two evidence gaps the
 * verbatim Codex critique flagged:
 *
 *  (a) Codex #2: residual (iii) closure rests on a conversational claim that
 *      #1002807 is a test duplicate of #993347. Verify #993347 actually
 *      exists and is a REAL funded request (real applicant ≠ Foundation,
 *      real award) so the closure is artifact-backed, not just attested.
 *
 *  (b) Codex #5: the Medical Research roll-up probe did not apply the
 *      test-record exclusion predicate. Quantify test-pollution: of the
 *      akoya_programid="Medical Research" rows, how many / how much $ have
 *      applicant = "W. M. Keck Foundation" (the residual-(iii) predicate),
 *      and what does the Program-only total look like with them removed.
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
    if (!r.ok) throw new Error(`GET ${urlPath}: ${r.status} ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    if (body.value) { for (const v of body.value) rows.push(v); next = body['@odata.nextLink']; }
    else return body;
  }
  return { value: rows };
}

const FV = '@OData.Community.Display.V1.FormattedValue';
const money = (n) => '$' + Math.round(Number(n || 0)).toLocaleString();

(async () => {
  const token = await getToken();
  console.log(`S158 Codex follow-ups — ${new Date().toISOString()} (read-only)\n`);

  // ── (a) verify #993347 (the real original #1002807 was allegedly cloned from)
  console.log(`══ (a) Verify #993347 — claimed real original of test #1002807 ══`);
  for (const num of ['993347', '1002807']) {
    const r = (await get(token,
      `/akoya_requests?$filter=${encodeURIComponent(`akoya_requestnum eq '${num}'`)}` +
      `&$select=akoya_requestnum,akoya_requeststatus,akoya_grant,akoya_paid,akoya_title,createdon,_akoya_applicantid_value,_akoya_programid_value,_wmkf_type_value`)).value;
    if (!r.length) { console.log(`  #${num}: NOT FOUND`); continue; }
    const x = r[0];
    console.log(`  #${num}: status=${x.akoya_requeststatus}  grant=${money(x.akoya_grant)}  paid=${money(x.akoya_paid)}  created=${x.createdon}`);
    console.log(`         applicant=${x[`_akoya_applicantid_value${FV}`] || '—'}  program=${x[`_akoya_programid_value${FV}`] || '—'}  type=${x[`_wmkf_type_value${FV}`] || '—'}`);
    console.log(`         title="${(x.akoya_title || '').slice(0, 70)}"`);
  }
  console.log(`  INTERPRETATION: #993347 should be a REAL request — applicant ≠ "W. M. Keck Foundation",`);
  console.log(`  plausible award — making #1002807 (Foundation-applicant, $1M, "molecular encoding") a credible clone-for-test.\n`);

  // ── (b) Medical Research test-pollution check
  console.log(`══ (b) Medical Research roll-up — test-record pollution check ══`);
  const fAccts = (await get(token,
    `/accounts?$select=accountid&$filter=${encodeURIComponent("name eq 'W. M. Keck Foundation'")}`)).value.map((a) => a.accountid);
  const prog = (await get(token,
    `/akoya_programs?$select=akoya_programid&$filter=${encodeURIComponent("akoya_program eq 'Medical Research'")}`)).value;
  const pid = prog[0].akoya_programid;
  const rows = (await get(token,
    `/akoya_requests?$filter=${encodeURIComponent(`_akoya_programid_value eq ${pid}`)}` +
    `&$select=akoya_requestnum,_wmkf_type_value,akoya_grant,_akoya_applicantid_value,createdon`)).value;

  const isProgram = (r) => /^Program$/i.test(r[`_wmkf_type_value${FV}`] || '');
  const isFoundationApplicant = (r) => fAccts.includes(r._akoya_applicantid_value);
  const prog_all = rows.filter(isProgram);
  const prog_fnd = prog_all.filter(isFoundationApplicant);
  const prog_clean = prog_all.filter((r) => !isFoundationApplicant(r));
  const sum = (set) => set.reduce((s, r) => s + Number(r.akoya_grant || 0), 0);

  console.log(`  Foundation-applicant account ids: ${fAccts.length}`);
  console.log(`  wmkf_type=Program rows tagged Medical Research      : ${prog_all.length}, ${money(sum(prog_all))} grant`);
  console.log(`  ├─ with applicant = "W. M. Keck Foundation" (test predicate): ${prog_fnd.length}, ${money(sum(prog_fnd))}`);
  console.log(`  └─ test-excluded Program total                      : ${prog_clean.length}, ${money(sum(prog_clean))}`);
  if (prog_fnd.length) {
    console.log(`  ⚠️ test-predicate rows present in the headline Program figure:`);
    for (const r of prog_fnd) console.log(`     #${r.akoya_requestnum}  grant=${money(r.akoya_grant)}  created=${r.createdon}`);
  } else {
    console.log(`  ✅ ZERO test-predicate rows in the Medical Research Program total — the $493M is not test-polluted.`);
  }
  console.log('\nDone (read-only — S158 Codex follow-ups).');
})().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
