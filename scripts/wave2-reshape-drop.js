#!/usr/bin/env node
/**
 * One-off: drop wmkf_potentialreviewers.wmkf_requestlookup column +
 * delete our two empty wave-2 tables (wmkf_appreviewersuggestion,
 * wmkf_appresearcher) so we can recreate them with the reshaped lookups.
 *
 * Safe-to-rerun: 404 on already-deleted artifacts is treated as success.
 */
const { loadEnvLocal, getAccessToken, createClient } = require('../lib/dataverse/client');

async function tryDelete(client, label, urlPath) {
  const r = await client.delete_(urlPath);
  if (r.status >= 200 && r.status < 300) {
    console.log(`  ✓ deleted   ${label}`);
    return { ok: true };
  }
  if (r.status === 404) {
    console.log(`  · gone      ${label}`);
    return { ok: true, alreadyGone: true };
  }
  console.log(`  ✗ status ${r.status} ${label}: ${r.body?.error?.message || JSON.stringify(r.body)}`);
  return { ok: false, status: r.status, body: r.body };
}

async function main() {
  loadEnvLocal();
  const url = process.env.DYNAMICS_URL;
  if (!url) throw new Error('DYNAMICS_URL not set');
  const token = await getAccessToken(url);
  const c = createClient({ resourceUrl: url, token });

  console.log('━━━ Drop wmkf_potentialreviewers.wmkf_requestlookup ━━━');
  // Lookup attributes are backed by a relationship. Try attribute delete first;
  // if it errors, fall back to relationship delete (which cascades the attribute).
  let r = await tryDelete(
    c,
    "attr  wmkf_potentialreviewers.wmkf_requestlookup",
    "/EntityDefinitions(LogicalName='wmkf_potentialreviewers')/Attributes(LogicalName='wmkf_requestlookup')"
  );
  if (!r.ok) {
    console.log('  trying relationship delete…');
    const rel = await c.get(
      "/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata" +
      "?$select=SchemaName,ReferencingAttribute" +
      "&$filter=ReferencingEntity eq 'wmkf_potentialreviewers' and ReferencingAttribute eq 'wmkf_requestlookup'"
    );
    if (rel.body.value?.length) {
      const schemaName = rel.body.value[0].SchemaName;
      console.log(`  relationship schemaName: ${schemaName}`);
      await tryDelete(
        c,
        `rel   ${schemaName}`,
        `/RelationshipDefinitions(SchemaName='${schemaName}')`
      );
    } else {
      console.log('  · no matching relationship found (column may already be dropped)');
    }
  }

  console.log('\n━━━ Delete empty wave-2 entities ━━━');
  await tryDelete(
    c,
    'entity wmkf_appreviewersuggestion',
    "/EntityDefinitions(LogicalName='wmkf_appreviewersuggestion')"
  );
  // wmkf_apppublicationauthor has a lookup -> wmkf_appresearcher, so it blocks
  // the researcher delete. Drop the publication_author table first; it's empty
  // and gets recreated with the rest of wave 2.
  await tryDelete(
    c,
    'entity wmkf_apppublicationauthor',
    "/EntityDefinitions(LogicalName='wmkf_apppublicationauthor')"
  );
  await tryDelete(
    c,
    'entity wmkf_appresearcher',
    "/EntityDefinitions(LogicalName='wmkf_appresearcher')"
  );

  console.log('\n═══ Done ═══');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
