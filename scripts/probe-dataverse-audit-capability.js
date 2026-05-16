#!/usr/bin/env node
/**
 * Read-only capability probe: can this app's service principal read the
 * Dataverse Audit log, and is auditing even enabled for the entities the
 * Power Tools (Track A) would care about?
 *
 * Answers, empirically:
 *   1. Org-level auditing on?            (organizations.isauditenabled)
 *   2. Entity + attribute auditing on?   (EntityMetadata / Attribute IsAuditEnabled)
 *   3. Can WE read the audit table?      (GET /audits  -> 200 vs 403)  [the go/no-go]
 *   4. Can we extract per-field deltas?  (RetrieveAuditDetails on one row)
 *
 * No Dataverse mutations: the only POST is the OAuth token request to
 * Microsoft identity; every Dataverse call is a GET. Each step captures
 * status and continues — a 403 on step 3 is itself the finding.
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
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
      scope: `${resource}/.default`,
    }),
  });
  if (!res.ok) throw new Error(`Token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function get(token, urlPath) {
  const url = `${process.env.DYNAMICS_URL}/api/data/v9.2${urlPath}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'odata.include-annotations="*"',
    },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
}

function short(v, n = 240) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

(async () => {
  const token = await getToken();
  console.log('Token acquired.\n');

  // 1. Org-level audit flag
  console.log('── 1. Org-level auditing ──');
  {
    const r = await get(token, '/organizations?$select=name,isauditenabled');
    if (r.ok) {
      const o = (r.body.value || [])[0] || {};
      console.log(`  org="${o.name}"  isauditenabled=${o.isauditenabled}`);
    } else {
      console.log(`  [${r.status}] ${short(r.body)}`);
    }
  }

  // 2. Entity + attribute audit flags for akoya_request and contact
  console.log('\n── 2. Entity / attribute auditing ──');
  for (const ent of ['akoya_request', 'contact']) {
    const em = await get(
      token,
      `/EntityDefinitions(LogicalName='${ent}')?$select=LogicalName,IsAuditEnabled`,
    );
    if (!em.ok) {
      console.log(`  ${ent}: entity-meta [${em.status}] ${short(em.body)}`);
      continue;
    }
    const entAudit = em.body.IsAuditEnabled && em.body.IsAuditEnabled.Value;
    const at = await get(
      token,
      `/EntityDefinitions(LogicalName='${ent}')/Attributes?$select=LogicalName,IsAuditEnabled`,
    );
    let total = 0, audited = 0, sample = [];
    if (at.ok) {
      for (const a of at.body.value || []) {
        total++;
        if (a.IsAuditEnabled && a.IsAuditEnabled.Value) {
          audited++;
          if (sample.length < 12) sample.push(a.LogicalName);
        }
      }
    }
    console.log(
      `  ${ent}: entityAudit=${entAudit}  attrs ${audited}/${total} audited` +
      (at.ok ? `\n    e.g. ${sample.join(', ') || '(none)'}` : `\n    attrs [${at.status}] ${short(at.body)}`),
    );
  }

  // resolve the entity set name for akoya_request (don't guess plural)
  let reqSet = 'akoya_requests';
  {
    const em = await get(token, `/EntityDefinitions(LogicalName='akoya_request')?$select=EntitySetName`);
    if (em.ok && em.body.EntitySetName) reqSet = em.body.EntitySetName;
  }

  // 3a. BULK audit read, correctly shaped (single objecttypecode condition).
  //     This is the real go/no-go for the "which fields edited most" aggregate.
  console.log('\n── 3a. BULK audit read — correctly shaped (aggregate path) ──');
  let bulkRows = [];
  {
    const scoped = await get(
      token,
      `/audits?$top=5&$orderby=createdon desc&$filter=objecttypecode eq 'akoya_request'` +
      `&$select=auditid,action,operation,createdon,_objectid_value`,
    );
    console.log(`  GET /audits?$filter=objecttypecode eq 'akoya_request': [${scoped.status}]`);
    if (scoped.ok) {
      bulkRows = scoped.body.value || [];
      console.log(`    READABLE — ${bulkRows.length} row(s). Aggregate field-edit analysis IS available.`);
      for (const a of bulkRows) {
        console.log(`    • ${a.createdon}  obj=${a._objectid_value}  ` +
          `action=${a['action@OData.Community.Display.V1.FormattedValue'] || a.action}  ` +
          `op=${a['operation@OData.Community.Display.V1.FormattedValue'] || a.operation}`);
      }
    } else {
      console.log(`    BLOCKED — ${short(scoped.body)}`);
      console.log('    → genuine ReadAuditSummary privilege gap (query shape is now correct).');
    }
  }

  // 3b. PER-RECORD change history — different privilege surface, and the
  //     more directly useful path for Track A (history at point-of-edit).
  console.log('\n── 3b. PER-RECORD change history (Track A point-of-edit path) ──');
  {
    const samp = await get(token, `/${reqSet}?$top=1&$select=akoya_requestid`);
    const recId = samp.ok && (samp.body.value || [])[0] && (samp.body.value[0].akoya_requestid);
    if (!recId) {
      console.log(`  (could not get a sample ${reqSet} id: [${samp.status}] ${short(samp.body)})`);
    } else {
      const tgt = encodeURIComponent(JSON.stringify({ '@odata.id': `${reqSet}(${recId})` }));
      const hist = await get(
        token,
        `/RetrieveRecordChangeHistory(Target=@t)?@t=${tgt}`,
      );
      console.log(`  RetrieveRecordChangeHistory(Target=${reqSet}(${recId})): [${hist.status}]`);
      if (hist.ok) {
        const details = (hist.body.AuditDetailCollection && hist.body.AuditDetailCollection.AuditDetails) || [];
        console.log(`    READABLE — ${details.length} change record(s) for this one request.`);
        const attrFreq = {};
        for (const d of details) {
          const nv = d.NewValue || {};
          for (const k of Object.keys(nv)) {
            if (k.startsWith('@') || k.endsWith('@odata.type')) continue;
            attrFreq[k] = (attrFreq[k] || 0) + 1;
          }
        }
        const top = Object.entries(attrFreq).sort((a, b) => b[1] - a[1]).slice(0, 12);
        console.log(`    changed-attr frequency (this record): ${top.map(([k, n]) => `${k}×${n}`).join(', ') || '(none parsed)'}`);
      } else {
        console.log(`    BLOCKED — ${short(hist.body)}`);
      }
    }
  }

  // 4. per-field delta extraction on one bulk audit row (if 3a worked)
  console.log('\n── 4. RetrieveAuditDetails (per-field deltas, from bulk row) ──');
  if (bulkRows[0] && bulkRows[0].auditid) {
    const det = await get(
      token,
      `/audits(${bulkRows[0].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails()`,
    );
    console.log(`  RetrieveAuditDetails(${bulkRows[0].auditid}): [${det.status}]`);
    if (det.ok) {
      const ad = det.body.AuditDetail || det.body;
      const oldv = ad.OldValue ? Object.keys(ad.OldValue).filter(k => !k.startsWith('@')) : [];
      const newv = ad.NewValue ? Object.keys(ad.NewValue).filter(k => !k.startsWith('@')) : [];
      console.log(`    type=${ad['@odata.type'] || '?'}  old=[${oldv.join(',')}] new=[${newv.join(',')}]`);
    } else {
      console.log(`    ${short(det.body)}`);
    }
  } else {
    console.log('  (skipped — no readable bulk audit row from 3a)');
  }

  console.log('\nDone (read-only probe).');
})().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
