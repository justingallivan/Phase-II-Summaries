#!/usr/bin/env node
/**
 * Gated-step-1 evidence probe (READ-ONLY): the akoya_request polymorphism
 * discriminator(s), per-type volumes, and the Akoya-native vs. migrated era
 * distribution. Feeds the Track B semantic-layer "type/era taxonomy" artifact.
 *
 * Atlas-identified candidates (docs/atlas/dataverse-akoya-request.md):
 *   - akoya_requeststatus  (String  — lifecycle)
 *   - akoya_requesttype    (Picklist)
 *   - wmkf_request_type    (Picklist)
 *   - _wmkf_grantprogram_value (program lookup)
 *   - createdon            (system create)
 *   - overriddencreatedon  (set ONLY on imported/migrated rows — era marker)
 *
 * Only POST is the OAuth token; every Dataverse call is a GET. FetchXML
 * aggregate has a 50k processing cap — on overflow we fall back to total
 * count + note the limit rather than report a wrong number.
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

async function fetchXmlAgg(token, fetchXml) {
  const r = await get(token, `/akoya_requests?fetchXml=${encodeURIComponent(fetchXml)}`);
  return r;
}

function short(v, n = 200) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // Total volume
  const cnt = await get(token, '/akoya_requests/$count');
  const total = cnt.ok ? cnt.body : `[${cnt.status}] ${short(cnt.body)}`;
  console.log(`akoya_request total rows: ${total}\n`);

  // ---- Picklist option metadata (value -> label) ----
  const picklists = ['akoya_requesttype', 'wmkf_request_type'];
  const optMaps = {};
  for (const f of picklists) {
    const r = await get(
      token,
      `/EntityDefinitions(LogicalName='akoya_request')/Attributes(LogicalName='${f}')/` +
      `Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`,
    );
    const map = {};
    if (r.ok && r.body.OptionSet && r.body.OptionSet.Options) {
      for (const o of r.body.OptionSet.Options) {
        map[o.Value] = (o.Label && o.Label.UserLocalizedLabel && o.Label.UserLocalizedLabel.Label) || String(o.Value);
      }
    }
    optMaps[f] = map;
    console.log(`── ${f}: ${r.ok ? Object.keys(map).length + ' options' : '[' + r.status + '] ' + short(r.body)} ──`);
    if (r.ok) for (const [v, l] of Object.entries(map)) console.log(`   ${v} = ${l}`);
    console.log();
  }

  // ---- Per-type volume (FetchXML aggregate group-by) ----
  async function distro(attr, label) {
    const fx =
      `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="${attr}" alias="v" groupby="true"/>` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `</entity></fetch>`;
    const r = await fetchXmlAgg(token, fx);
    console.log(`── distribution by ${label} (${attr}) ──`);
    if (!r.ok) {
      console.log(`   [${r.status}] ${short(r.body)} (aggregate cap is 50k — partial/blocked)\n`);
      return;
    }
    const rows = (r.body.value || []).map(x => ({ v: x.v, c: x.c }))
      .sort((a, b) => (b.c || 0) - (a.c || 0));
    for (const row of rows) {
      let lbl = row.v;
      if (optMaps[attr] && optMaps[attr][row.v] !== undefined) lbl = `${row.v} (${optMaps[attr][row.v]})`;
      else if (row.v === null || row.v === undefined) lbl = '(null)';
      console.log(`   ${String(row.c).padStart(7)}  ${lbl}`);
    }
    console.log();
  }
  await distro('akoya_requesttype', 'request type (picklist)');
  await distro('wmkf_request_type', 'WMKF request type (picklist)');
  await distro('akoya_requeststatus', 'lifecycle status (string)');
  await distro('statecode', 'state code');

  // ---- Program lookup distribution (top programs by name) ----
  {
    const fx =
      `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="wmkf_grantprogram" alias="p" groupby="true"/>` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `</entity></fetch>`;
    const r = await fetchXmlAgg(token, fx);
    console.log('── distribution by program (wmkf_grantprogram lookup id) ──');
    if (!r.ok) console.log(`   [${r.status}] ${short(r.body)}\n`);
    else {
      const rows = (r.body.value || []).map(x => ({
        p: x['p'], name: x['p@OData.Community.Display.V1.FormattedValue'], c: x.c,
      })).sort((a, b) => (b.c || 0) - (a.c || 0)).slice(0, 25);
      for (const row of rows) console.log(`   ${String(row.c).padStart(7)}  ${row.name || row.p || '(null)'}`);
      console.log();
    }
  }

  // ---- Era distribution: createdon by year ----
  async function yearDistro(attr) {
    const fx =
      `<fetch aggregate="true"><entity name="akoya_request">` +
      `<attribute name="${attr}" alias="y" groupby="true" dategrouping="year"/>` +
      `<attribute name="akoya_requestid" alias="c" aggregate="count"/>` +
      `</entity></fetch>`;
    const r = await fetchXmlAgg(token, fx);
    console.log(`── ${attr} by year ──`);
    if (!r.ok) { console.log(`   [${r.status}] ${short(r.body)}\n`); return; }
    const rows = (r.body.value || []).map(x => ({ y: x.y, c: x.c }))
      .sort((a, b) => String(a.y).localeCompare(String(b.y)));
    for (const row of rows) console.log(`   ${row.y == null ? '(null)' : row.y}: ${row.c}`);
    console.log();
  }
  await yearDistro('createdon');          // system create (Akoya-era proxy)
  await yearDistro('overriddencreatedon'); // set only on imported/migrated rows = true original era

  // migrated marker: how many rows carry overriddencreatedon at all
  const mig = await get(
    token,
    `/akoya_requests/$count?$filter=overriddencreatedon ne null`,
  );
  console.log(`rows with overriddencreatedon (imported/migrated marker): ${mig.ok ? mig.body : '[' + mig.status + '] ' + short(mig.body)}`);

  console.log('\nDone (read-only discriminator/era probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
