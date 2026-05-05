/**
 * Dynamics 365 Schema Diff
 *
 * For every table in shared/config/prompts/dynamics-explorer.js
 * `TABLE_ANNOTATIONS`, fetch the full attribute metadata via
 * EntityDefinitions and report fields that exist in Dataverse
 * but are NOT documented in our inline schema.
 *
 * Definition-based (not sample-based), so sparsely-populated new
 * fields like `wmkf_ai_summary` are surfaced.
 *
 * Usage:
 *   node scripts/dynamics-schema-diff.js [tableName ...]
 *
 * If table names are passed, only those are diffed. Otherwise all
 * annotated tables are diffed.
 *
 * Requires .env.local with:
 *   DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 *
 * Output:
 *   Console — per-table report grouped by attribute type
 *   scripts/dynamics-schema-diff.json — full structured diff
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// ─── Load .env.local ───
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [rawKey, ...valueParts] = trimmed.split('=');
    const key = rawKey.trim();
    if (!key || valueParts.length === 0) return;
    let value = valueParts.join('=').trim();
    if (value.startsWith('"')) {
      const end = value.indexOf('"', 1);
      if (end > 0) value = value.substring(1, end);
    } else if (value.startsWith("'")) {
      const end = value.indexOf("'", 1);
      if (end > 0) value = value.substring(1, end);
    } else {
      const c = value.indexOf('#');
      if (c > 0) value = value.substring(0, c).trim();
    }
    process.env[key] = value;
  });
} else {
  console.error('No .env.local file found.');
  process.exit(1);
}

const DYNAMICS_URL = process.env.DYNAMICS_URL;
const TENANT_ID = process.env.DYNAMICS_TENANT_ID;
const CLIENT_ID = process.env.DYNAMICS_CLIENT_ID;
const CLIENT_SECRET = process.env.DYNAMICS_CLIENT_SECRET;

if (!DYNAMICS_URL || !TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing DYNAMICS_URL / DYNAMICS_TENANT_ID / DYNAMICS_CLIENT_ID / DYNAMICS_CLIENT_SECRET');
  process.exit(1);
}

// ─── Auth ───

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) return tokenCache.token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${DYNAMICS_URL}/.default`,
  });
  const resp = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Token request failed (${resp.status}): ${await resp.text()}`);
  const data = await resp.json();
  tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

async function dynamicsGet(urlPath, token) {
  const resp = await fetch(`${DYNAMICS_URL}/api/data/v9.2/${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`GET ${urlPath} failed (${resp.status}): ${(await resp.text()).substring(0, 300)}`);
  return resp.json();
}

// ─── Annotation key normalization ───

/**
 * Expand TABLE_ANNOTATIONS field keys into the set of real attribute
 * LogicalNames they cover. Handles:
 *   - `_xxx_value`         → `xxx`            (lookup OData → real lookup attr)
 *   - `wmkf_xx1title..4title` → wmkf_xx1title, wmkf_xx2title, wmkf_xx3title, wmkf_xx4title
 *   - `_wmkf_potentialreviewer1_value..5` → _wmkf_potentialreviewer1_value, ..., _5_value (then stripped)
 *   - everything else passes through unchanged
 */
function expandAnnotationKey(key) {
  // Range expansion: "prefixNsuffix..M" or "prefixN_value..M"
  // Match patterns like "wmkf_mrconcept1title..4title" or "_wmkf_potentialreviewer1_value..5"
  const rangeMatch = key.match(/^(.+?)(\d+)(.*?)\.\.(\d+)(.*)$/);
  if (rangeMatch) {
    const [, prefix, startStr, midSuffix, endStr, tailSuffix] = rangeMatch;
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    const expanded = [];
    // Two flavors observed:
    //   "wmkf_mrconcept1title..4title"  → midSuffix='title', tailSuffix='title' (suffix repeated)
    //   "_wmkf_potentialreviewer1_value..5"  → midSuffix='_value', tailSuffix='' (numeric only on right)
    for (let i = start; i <= end; i++) {
      const suffix = tailSuffix || midSuffix;
      expanded.push(`${prefix}${i}${suffix}`);
    }
    return expanded.flatMap(normalizeSingleKey);
  }
  return normalizeSingleKey(key);
}

function normalizeSingleKey(key) {
  // _xxx_value → xxx (lookup OData form → real attribute LogicalName)
  if (key.startsWith('_') && key.endsWith('_value')) {
    return [key.slice(1, -'_value'.length)];
  }
  return [key];
}

// ─── Metadata filtering ───

/**
 * Decide whether an attribute is "interesting enough" to surface in the diff.
 * Skip:
 *   - subordinate attributes (AttributeOf set — e.g. _formatted, name fields)
 *   - the entity's primary key (uniqueidentifier marked IsPrimaryId, but we
 *     don't pull that flag here; we filter by name match in diff instead)
 *   - currency *_base shadow fields (have AttributeOf set, so already filtered)
 *   - infrastructure noise: VersionNumber, ImportSequenceNumber, TimeZoneRule*,
 *     UTCConversionTimeZoneCode, OverriddenCreatedOn, processid, stageid,
 *     traversedpath, owningbusinessunit/team, owninguser variants
 */
const NOISE_FIELDS = new Set([
  'versionnumber', 'importsequencenumber', 'overriddencreatedon',
  'utcconversiontimezonecode', 'timezoneruleversionnumber',
  'processid', 'stageid', 'traversedpath',
  'owninguser', 'owningteam', 'owningbusinessunit',
  'createdonbehalfby', 'modifiedonbehalfby',
  'transactioncurrencyid', 'exchangerate',
  'msa_partnerid', 'msa_partneroriginid',
]);

const TRASH_DISPLAY_PATTERNS = [/^TRASH\b/i, /\bDEPRECATED\b/i, /\bDO NOT USE\b/i];

function isInteresting(attr, allByName) {
  if (attr.AttributeOf) return false;
  if (NOISE_FIELDS.has(attr.LogicalName)) return false;

  // Drop `*_base` currency shadow fields when the non-suffixed field also exists
  if (attr.LogicalName.endsWith('_base')) {
    const baseName = attr.LogicalName.slice(0, -'_base'.length);
    if (allByName.has(baseName)) return false;
  }

  // Drop fields explicitly labeled as trash / deprecated / do-not-use
  const display = attr.DisplayName?.UserLocalizedLabel?.Label || '';
  if (TRASH_DISPLAY_PATTERNS.some(p => p.test(display))) return false;

  return true;
}

// ─── Main ───

async function main() {
  const requested = process.argv.slice(2);

  console.log('Loading TABLE_ANNOTATIONS...');
  const promptModuleUrl = pathToFileURL(
    path.join(__dirname, '..', 'shared', 'config', 'prompts', 'dynamics-explorer.js')
  ).href;
  const { TABLE_ANNOTATIONS } = await import(promptModuleUrl);

  const allTables = Object.keys(TABLE_ANNOTATIONS);
  const tables = requested.length > 0
    ? requested.filter(t => {
        if (!allTables.includes(t)) {
          console.error(`Unknown table: ${t}. Known: ${allTables.join(', ')}`);
          process.exit(1);
        }
        return true;
      })
    : allTables;

  console.log(`Diffing ${tables.length} table(s): ${tables.join(', ')}\n`);

  const token = await getAccessToken();
  console.log('✓ Authenticated\n');

  const report = {};

  for (const tableName of tables) {
    const annotated = TABLE_ANNOTATIONS[tableName];
    console.log(`\n━━━ ${tableName} (${annotated.entitySet}) ━━━`);

    // Build the set of annotation-covered attribute LogicalNames
    const covered = new Set();
    for (const key of Object.keys(annotated.fields)) {
      for (const expanded of expandAnnotationKey(key)) {
        covered.add(expanded.toLowerCase());
      }
    }

    // Fetch full attribute metadata
    let attrs;
    try {
      const data = await dynamicsGet(
        `EntityDefinitions(LogicalName='${tableName}')/Attributes?$select=LogicalName,AttributeType,DisplayName,Description,IsCustomAttribute,AttributeOf,IsValidForRead,IsPrimaryId`,
        token
      );
      attrs = data.value || [];
    } catch (err) {
      console.log(`  ✗ Failed to fetch metadata: ${err.message}`);
      report[tableName] = { error: err.message };
      continue;
    }

    const allByName = new Set(attrs.map(a => a.LogicalName));
    const interesting = attrs.filter(a => isInteresting(a, allByName)).filter(a => !a.IsPrimaryId);

    const missing = interesting
      .filter(a => !covered.has(a.LogicalName.toLowerCase()))
      .map(a => ({
        logicalName: a.LogicalName,
        type: a.AttributeType,
        displayName: a.DisplayName?.UserLocalizedLabel?.Label || '',
        description: a.Description?.UserLocalizedLabel?.Label || '',
        isCustom: a.IsCustomAttribute,
      }));

    // Group by type for readability
    const byType = {};
    for (const f of missing) {
      (byType[f.type] = byType[f.type] || []).push(f);
    }

    console.log(`  Total attributes: ${attrs.length}, interesting: ${interesting.length}, annotated: ${covered.size}`);
    console.log(`  Missing from annotations: ${missing.length}`);

    if (missing.length === 0) {
      console.log('  ✓ All attributes covered.');
    } else {
      const typeOrder = ['String', 'Memo', 'Money', 'DateTime', 'Integer', 'Decimal', 'Double', 'Boolean', 'Picklist', 'Status', 'State', 'Lookup', 'Customer', 'Owner', 'Uniqueidentifier', 'Virtual', 'BigInt'];
      const sortedTypes = Object.keys(byType).sort((a, b) => {
        const ai = typeOrder.indexOf(a); const bi = typeOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      for (const type of sortedTypes) {
        const list = byType[type].sort((a, b) => a.logicalName.localeCompare(b.logicalName));
        console.log(`\n  [${type}] ${list.length}`);
        for (const f of list) {
          const custom = f.isCustom ? '*' : ' ';
          const display = f.displayName ? `  "${f.displayName}"` : '';
          const desc = f.description ? `  — ${f.description.substring(0, 100)}` : '';
          console.log(`   ${custom} ${f.logicalName.padEnd(45)}${display}${desc}`);
        }
      }
    }

    report[tableName] = {
      entitySet: annotated.entitySet,
      counts: {
        total: attrs.length,
        interesting: interesting.length,
        annotated: covered.size,
        missing: missing.length,
      },
      missing,
    };
  }

  const outPath = path.join(__dirname, 'dynamics-schema-diff.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n\n✓ Full diff written to ${path.relative(process.cwd(), outPath)}`);
  console.log('  Legend: leading `*` = custom attribute (wmkf_/akoya_); leading space = system');
}

main().catch(err => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
