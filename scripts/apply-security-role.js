#!/usr/bin/env node
/**
 * Apply a security role to the target Dataverse environment.
 *
 * Usage:
 *   node scripts/apply-security-role.js                              # sandbox, dry-run, wave1-staff
 *   node scripts/apply-security-role.js --execute                    # sandbox, live
 *   node scripts/apply-security-role.js --role=wave1-staff --execute
 *   node scripts/apply-security-role.js --target=prod --execute      # prod (needs sysadmin app user)
 *   node scripts/apply-security-role.js --assign=user@wmkeck.org,other@wmkeck.org --execute
 *
 * Flags:
 *   --target=sandbox|prod   default: sandbox
 *   --role=<file-stem>      default: wave1-staff (resolves to lib/dataverse/schema/roles/<stem>.json)
 *   --assign=<emails|ids>   comma-separated systemuser internalemailaddress OR systemuserid GUIDs
 *   --execute               perform writes (dry-run by default)
 *
 * Design:
 *   - Idempotent. AddPrivilegesRole upserts. Solution-membership + user-assignment
 *     swallow "already present" errors.
 *   - Dry run prints the plan without writing.
 *   - Prod requires --target=prod AND --execute, same as apply-dataverse-schema.js.
 */

const fs = require('fs');
const path = require('path');
const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');
const {
  getRootBusinessUnit,
  ensureRole,
  resolvePrivilegeIds,
  applyPrivileges,
  findSolutionId,
  addRoleToSolution,
  assignRoleToUser,
} = require('../lib/dataverse/role-apply');

loadEnvLocal();

function parseArgs(argv) {
  const out = { target: 'sandbox', role: 'wave1-staff', assign: [], execute: false };
  for (const a of argv.slice(2)) {
    if (a === '--execute') out.execute = true;
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else if (a.startsWith('--role=')) out.role = a.slice('--role='.length);
    else if (a.startsWith('--assign=')) out.assign = a.slice('--assign='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/apply-security-role.js [--target=sandbox|prod] [--role=<stem>] [--assign=a,b] [--execute]');
      process.exit(0);
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function loadRoleSpec(stem) {
  const p = path.join(__dirname, '..', 'lib', 'dataverse', 'schema', 'roles', `${stem}.json`);
  if (!fs.existsSync(p)) throw new Error(`Role spec not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resourceUrl(target) {
  if (target === 'prod') {
    const u = process.env.DYNAMICS_URL;
    if (!u) throw new Error('DYNAMICS_URL not set');
    return u;
  }
  if (target === 'sandbox') {
    const u = process.env.DYNAMICS_SANDBOX_URL;
    if (!u) throw new Error('DYNAMICS_SANDBOX_URL not set');
    return u;
  }
  throw new Error(`Unknown target: ${target}`);
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAssignees(client, tokens) {
  const resolved = [];
  for (const t of tokens) {
    if (GUID_RE.test(t)) {
      resolved.push({ id: t, label: t });
      continue;
    }
    const filter = `internalemailaddress eq '${t.replace(/'/g, "''")}'`;
    const r = await client.get(
      `/systemusers?$filter=${encodeURIComponent(filter)}&$select=systemuserid,fullname,internalemailaddress`,
    );
    if (!r.ok) throw new Error(`user lookup failed for ${t}: ${r.status} ${r.text}`);
    const hit = r.body?.value?.[0];
    if (!hit) throw new Error(`No systemuser found for '${t}'`);
    resolved.push({ id: hit.systemuserid, label: `${hit.fullname} <${hit.internalemailaddress}>` });
  }
  return resolved;
}

function tag(created) { return created ? '✓ created' : '· exists  '; }

(async () => {
  const args = parseArgs(process.argv);
  const resource = resourceUrl(args.target);
  const mode = args.execute ? 'EXECUTE' : 'DRY-RUN';
  const spec = loadRoleSpec(args.role);

  console.log(`Target:   ${args.target} (${resource})`);
  console.log(`Role:     ${spec.name}`);
  console.log(`Mode:     ${mode}`);
  console.log(`Assign:   ${args.assign.length ? args.assign.join(', ') : '(none)'}`);
  if (args.target === 'prod' && !args.execute) {
    console.log('\n(prod + dry-run — nothing will be written)');
  }
  console.log('');

  const token = await getAccessToken(resource);
  const client = createClient({ resourceUrl: resource, token, dryRun: !args.execute });

  // ── 1. Resolve business unit ──
  console.log('━━━ Business unit ━━━');
  const bu = await getRootBusinessUnit(client);
  console.log(`  · root BU  ${bu.name} (${bu.businessunitid})`);

  // ── 2. Resolve all privilege IDs up front (fails loud on typos) ──
  console.log('\n━━━ Resolving privileges ━━━');
  const privilegesPayload = [];
  for (const p of spec.privileges) {
    const { resolved, missing } = await resolvePrivilegeIds(client, p.table, p.ops);
    if (missing.length) {
      throw new Error(`Missing privileges for ${p.table}: ${missing.join(', ')} — does the table exist in this environment?`);
    }
    for (const r of resolved) {
      console.log(`  · ${r.name.padEnd(50)} depth=${p.depth}`);
      privilegesPayload.push({ PrivilegeId: r.privilegeId, Depth: p.depth });
    }
  }
  console.log(`  → ${privilegesPayload.length} privilege(s) to apply`);

  // ── 3. Resolve assignees up front ──
  let assignees = [];
  if (args.assign.length) {
    console.log('\n━━━ Resolving assignees ━━━');
    assignees = await resolveAssignees(client, args.assign);
    for (const u of assignees) console.log(`  · ${u.label}`);
  }

  // ── 4. Ensure role ──
  console.log('\n━━━ Role ━━━');
  let role;
  if (!args.execute) {
    console.log(`  [dry-run] would ensure role '${spec.name}' in BU ${bu.businessunitid}`);
    role = { roleid: '(dry-run)', name: spec.name };
  } else {
    role = await ensureRole(client, {
      name: spec.name,
      description: spec.description,
      businessUnitId: bu.businessunitid,
      resourceUrl: resource,
    });
    console.log(`  ${tag(role.created)}  role  ${role.name} (${role.roleid})`);
  }

  // ── 5. Apply privileges ──
  console.log('\n━━━ Applying privileges ━━━');
  if (!args.execute) {
    console.log(`  [dry-run] would POST AddPrivilegesRole with ${privilegesPayload.length} privilege(s)`);
  } else {
    const r = await applyPrivileges(client, role.roleid, privilegesPayload);
    console.log(`  ✓ applied ${r.count} privilege(s)`);
  }

  // ── 6. Add role to solution ──
  if (spec.addToSolution) {
    console.log('\n━━━ Solution membership ━━━');
    if (!args.execute) {
      console.log(`  [dry-run] would add role to solution '${spec.addToSolution}'`);
    } else {
      const sol = await findSolutionId(client, spec.addToSolution);
      if (!sol) {
        console.log(`  ⚠ solution '${spec.addToSolution}' not found — skipping`);
      } else {
        const r = await addRoleToSolution(client, role.roleid, spec.addToSolution);
        console.log(`  ${r.alreadyPresent ? '·' : '✓'} ${r.alreadyPresent ? 'already in' : 'added to'} solution ${spec.addToSolution}`);
      }
    }
  }

  // ── 7. Assign role to users ──
  if (assignees.length) {
    console.log('\n━━━ User assignments ━━━');
    for (const u of assignees) {
      if (!args.execute) {
        console.log(`  [dry-run] would assign to ${u.label}`);
      } else {
        const r = await assignRoleToUser(client, role.roleid, u.id, resource);
        console.log(`  ${r.alreadyAssigned ? '·' : '✓'} ${r.alreadyAssigned ? 'already assigned' : 'assigned'} to ${u.label}`);
      }
    }
  }

  console.log('\n═══ Done ═══');
  if (!args.execute) {
    console.log('This was a dry run. Re-run with --execute to apply.');
  }
})().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
