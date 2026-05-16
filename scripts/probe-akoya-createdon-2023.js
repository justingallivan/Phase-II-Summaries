#!/usr/bin/env node
/**
 * Gated-step-1 follow-up (READ-ONLY): day-level `createdon` distribution
 * within 2023 for akoya_request.
 *
 * Hypothesis (user, S157): the ~2023 spike is a single bulk-import event on
 * one date; genuinely-new native requests created after the cutover trickle
 * in at normal rate on later 2023 dates. Day granularity should show one huge
 * spike date (= the migration) followed by a low-rate tail (= native creates).
 * That tail's start IS the practical Akoya-native cutover — recoverable from
 * Dataverse alone, without waiting on AkoyaGo/Connor, IF the shape is clean.
 *
 * FetchXML aggregate; 2023 cohort ~22,573 rows (< the 50k scan cap). Date
 * grouping is evaluated in the *calling user's* timezone — for the app
 * service principal that is UTC (no user tz record); dates below are UTC-day.
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
  const tenant = process.env.DYNAMICS_TENANT_ID;
  const clientId = process.env.DYNAMICS_CLIENT_ID;
  const secret = process.env.DYNAMICS_CLIENT_SECRET;
  const resource = process.env.DYNAMICS_URL;
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId,
      client_secret: secret, scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function get(token, urlPath) {
  const url = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const t = await r.text();
  let body; try { body = JSON.parse(t); } catch { body = t; }
  return { status: r.status, ok: r.ok, body };
}

function short(v, n = 240) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// FetchXML aggregate: createdon grouped by `grouping` (day|month), filtered
// to a [from, to] window. Returns sorted [{ key, c }].
//
// NOTE: a single `dategrouping="day"` alias returns ONLY day-of-month (alias
// `d`), not a full date — so we add explicit month + year groupings (`dm`,
// `dy`) and reconstruct an ISO key. (Original S157 run hit this; the day
// bucket showed "3" because year/month were never requested.)
async function distro(token, grouping, from, to, label) {
  const extra = grouping === 'day'
    ? `<attribute name="createdon" alias="dm" groupby="true" dategrouping="month"/>` +
      `<attribute name="createdon" alias="dy" groupby="true" dategrouping="year"/>`
    : grouping === 'month'
      ? `<attribute name="createdon" alias="dy" groupby="true" dategrouping="year"/>`
      : '';
  const fx =
    `<fetch aggregate="true"><entity name="akoya_request">` +
    `<attribute name="createdon" alias="d" groupby="true" dategrouping="${grouping}"/>` +
    extra +
    `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
    `<filter type="and">` +
    `<condition attribute="createdon" operator="on-or-after" value="${from}"/>` +
    `<condition attribute="createdon" operator="on-or-before" value="${to}"/>` +
    `</filter>` +
    `</entity></fetch>`;
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fx)}`);
  console.log(`── ${label} ──`);
  if (!r.ok) { console.log(`   [${r.status}] ${short(r.body)}\n`); return []; }
  const rows = (r.body.value || []).map(x => {
    const y = x.dy, mo = x.dm, da = x.d;
    let key;
    if (grouping === 'day') key = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
    else if (grouping === 'month') key = `${y}-${String(da).padStart(2, '0')}`;
    else key = String(da ?? '(null)');
    return { key, c: Number(x.c) || 0 };
  }).sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

// Exact wall-clock window of the cohort: earliest + latest raw createdon.
async function window(token, from, to) {
  const sel = `$select=createdon&$filter=createdon ge ${from} and createdon le ${to}`;
  const lo = await get(token, `/akoya_requests?${sel}&$orderby=createdon asc&$top=1`);
  const hi = await get(token, `/akoya_requests?${sel}&$orderby=createdon desc&$top=1`);
  return {
    earliest: lo.ok && lo.body.value && lo.body.value[0] && lo.body.value[0].createdon,
    latest: hi.ok && hi.body.value && hi.body.value[0] && hi.body.value[0].createdon,
  };
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // 1. Monthly shape for 2023 — orient before drilling to day.
  const months = await distro(token, 'month', '2023-01-01', '2023-12-31',
    'createdon by MONTH, 2023');
  let total2023 = 0;
  for (const m of months) { console.log(`   ${m.key}: ${m.c}`); total2023 += m.c; }
  console.log(`   [2023 total: ${total2023}]\n`);

  // 2. Day-level for all of 2023 — the actual "list of created dates".
  const days = await distro(token, 'day', '2023-01-01', '2023-12-31',
    'createdon by DAY, 2023 (full list)');
  for (const d of days) console.log(`   ${d.key}: ${d.c}`);
  console.log();

  // 3. Interpret: biggest single day = the bulk-import event; everything
  //    strictly after it (lower volume) = candidate native-creation tail.
  if (days.length) {
    const top = days.reduce((a, b) => (b.c > a.c ? b : a), days[0]);
    const after = days.filter(d => d.key > top.key);
    const afterSum = after.reduce((s, d) => s + d.c, 0);
    const before = days.filter(d => d.key < top.key);
    const beforeSum = before.reduce((s, d) => s + d.c, 0);
    console.log('── interpretation ──');
    console.log(`   bulk-import spike: ${top.key} = ${top.c} ` +
      `(${((top.c / total2023) * 100).toFixed(1)}% of 2023)`);
    console.log(`   distinct 2023 dates: ${days.length}`);
    console.log(`   BEFORE spike: ${before.length} date(s), ${beforeSum} row(s)`);
    console.log(`   AFTER  spike: ${after.length} date(s), ${afterSum} row(s) ` +
      `=> candidate native-create tail; first such date = ${after.length ? after[0].key : '(none)'}`);
    if (after.length) {
      const avg = (afterSum / after.length).toFixed(1);
      console.log(`   post-spike avg/day = ${avg} (low + steady => native trickle; ` +
        `another big day => >1 import wave / unclean boundary)`);
    }
    // Exact import window — pins the cutover to the minute, not just the day.
    const w = await window(token, '2023-01-01', '2023-12-31');
    console.log(`   exact 2023 createdon window: ${w.earliest} … ${w.latest}`);
    console.log(`   => single-day, single-window bulk import; native cohort = ` +
      `createdon AFTER ${top.key} (true historical date NOT recoverable — ` +
      `overriddencreatedon null everywhere, see probe-akoya-overriddencreatedon.js).`);
  }

  console.log('\nDone (read-only createdon-2023 day distribution).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
