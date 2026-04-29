/**
 * Idempotent schema-apply engine for Dataverse.
 *
 * Reads a declarative schema definition (see lib/dataverse/schema/ for shape)
 * and ensures the described publisher/solution/entities/attributes/relationships/alt-keys
 * exist on the target Dataverse environment.
 *
 * "Idempotent" here means: check existence before create. Updates of existing
 * artifacts are intentionally out of scope — a creation-only pattern keeps the
 * script safe to rerun and avoids surprise mutations of live schema. Updates
 * are a later concern, handled by maker portal or dedicated migration steps.
 */

const L = (s) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{
    '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
    Label: s,
    LanguageCode: 1033,
  }],
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withMetadataRetry(action, { attempts = 6, initialDelayMs = 1500, maxDelayMs = 8000 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(Math.min(initialDelayMs * (i + 1), maxDelayMs));
    const result = await action();
    if (result.ok) return result;
    const cacheLag = /EntityMetadataNotFoundException|MetadataCache|0x80040216|0x8004540[0-9A-F]/i.test(result.text || '');
    if (!cacheLag) return result;
    lastErr = result;
  }
  return lastErr;
}

function typeMetadata(attr) {
  const base = {
    SchemaName: attr.schemaName,
    DisplayName: L(attr.displayName || attr.schemaName),
    Description: attr.description ? L(attr.description) : undefined,
    RequiredLevel: { Value: attr.requiredLevel || 'None' },
  };
  switch (attr.type) {
    case 'String':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        MaxLength: attr.maxLength || 100,
        FormatName: { Value: attr.format || 'Text' },
        ...(attr.isPrimaryName ? { IsPrimaryName: true } : {}),
      };
    case 'Memo':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
        MaxLength: attr.maxLength || 2000,
        Format: attr.format || 'Text',
      };
    case 'Boolean':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        DefaultValue: attr.default ? true : false,
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
          TrueOption: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
            Value: 1, Label: L(attr.trueLabel || 'Yes'),
          },
          FalseOption: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
            Value: 0, Label: L(attr.falseLabel || 'No'),
          },
        },
      };
    case 'Integer':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
        MinValue: attr.minValue ?? -2147483648,
        MaxValue: attr.maxValue ?? 2147483647,
      };
    case 'DateTime':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        Format: attr.format || 'DateAndTime',
        DateTimeBehavior: { Value: attr.behavior || 'UserLocal' },
      };
    case 'Decimal':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
        MinValue: attr.minValue ?? -100000000000,
        MaxValue: attr.maxValue ?? 100000000000,
        Precision: attr.precision ?? 2,
      };
    case 'Double':
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata',
        MinValue: attr.minValue ?? -100000000000,
        MaxValue: attr.maxValue ?? 100000000000,
        Precision: attr.precision ?? 5,
      };
    case 'Picklist':
      // Local option set declared inline. options: [{ value: 1, label: 'Accepted' }, ...]
      // Values must be unique within the option set and ideally distinct from
      // other publishers' ranges (Dataverse auto-allocates from 100000000+ for
      // wmkf_ prefixed publishers if Value is omitted, but we set explicitly
      // so the schema file is the source of truth).
      if (!Array.isArray(attr.options) || attr.options.length === 0) {
        throw new Error(`Picklist attribute '${attr.schemaName}' requires options[]`);
      }
      return {
        ...base,
        '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
        DefaultFormValue: attr.defaultValue ?? -1,
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
          IsGlobal: false,
          OptionSetType: 'Picklist',
          Options: attr.options.map((o) => ({
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
            Value: o.value,
            Label: L(o.label),
            Description: o.description ? L(o.description) : undefined,
          })),
        },
      };
    default:
      throw new Error(`Unsupported attribute type: ${attr.type}`);
  }
}

async function entityExists(client, logicalName) {
  const r = await client.get(`/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName`);
  if (r.status === 404) return false;
  if (r.ok) return true;
  throw new Error(`Unexpected response checking entity '${logicalName}' (${r.status}): ${r.text.slice(0, 400)}`);
}

async function attributeExists(client, entityLogicalName, attrLogicalName) {
  // Dataverse 404s the direct `Attributes(LogicalName='x')` for non-String
  // subtypes without a type-cast. Filter-based query works uniformly.
  const r = await client.get(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$filter=LogicalName eq '${attrLogicalName}'&$select=LogicalName`,
  );
  if (r.status === 404) return false; // entity not found yet
  if (!r.ok) throw new Error(`Unexpected response checking attribute '${entityLogicalName}.${attrLogicalName}' (${r.status}): ${r.text.slice(0, 400)}`);
  return (r.body?.value || []).length > 0;
}

async function relationshipExists(client, relationshipSchemaName) {
  const r = await client.get(
    `/RelationshipDefinitions(SchemaName='${relationshipSchemaName}')?$select=SchemaName`,
  );
  if (r.status === 404) return false;
  if (r.ok) return true;
  throw new Error(`Unexpected response checking relationship '${relationshipSchemaName}' (${r.status}): ${r.text.slice(0, 400)}`);
}

async function ensurePublisher(client, { prefix, uniqueName }) {
  const filters = [];
  if (uniqueName) filters.push(`uniquename eq '${uniqueName}'`);
  if (prefix) filters.push(`customizationprefix eq '${prefix}'`);
  const filter = filters.join(' and ');
  const r = await client.get(
    `/publishers?$filter=${encodeURIComponent(filter)}&$select=publisherid,uniquename,friendlyname,customizationprefix`,
  );
  if (!r.ok) throw new Error(`Failed to list publishers: ${r.status} ${r.text.slice(0, 300)}`);
  const rows = r.body?.value || [];
  if (rows.length === 0) {
    throw new Error(`No publisher matched filter '${filter}'.`);
  }
  if (rows.length > 1 && !uniqueName) {
    const names = rows.map((p) => p.uniquename).join(', ');
    throw new Error(`Multiple publishers with prefix '${prefix}' [${names}] — set publisherUniqueName in solution.json to disambiguate.`);
  }
  return rows[0];
}

async function ensureSolution(client, { uniqueName, friendlyName, description, publisherId }) {
  const existing = await client.get(
    `/solutions?$filter=uniquename eq '${uniqueName}'&$select=solutionid,uniquename,friendlyname`,
  );
  if (!existing.ok) throw new Error(`Failed to list solutions: ${existing.status} ${existing.text.slice(0, 300)}`);
  const rows = existing.body?.value || [];
  if (rows.length > 0) {
    return { ...rows[0], created: false };
  }
  const body = {
    uniquename: uniqueName,
    friendlyname: friendlyName,
    description,
    version: '1.0.0.0',
    'publisherid@odata.bind': `/publishers(${publisherId})`,
  };
  // Do NOT bind the solution row itself to a MSCRM.SolutionUniqueName header —
  // the solution *is* the artifact being created.
  const r = await client.post('/solutions', body, { 'MSCRM.SolutionUniqueName': '' });
  if (!r.ok) throw new Error(`Failed to create solution '${uniqueName}': ${r.status} ${r.text.slice(0, 400)}`);
  // v9.2 POST returns 204 + OData-EntityId header; fetch the row back
  const after = await client.get(
    `/solutions?$filter=uniquename eq '${uniqueName}'&$select=solutionid,uniquename,friendlyname`,
  );
  const row = (after.body?.value || [])[0];
  return { ...row, created: true };
}

async function ensureEntity(client, def) {
  const logical = def.schemaName.toLowerCase();
  const exists = await entityExists(client, logical);
  if (exists) return { logical, created: false };

  const primary = def.primaryNameAttribute;
  const primaryAttr = typeMetadata({
    type: 'String',
    schemaName: primary.schemaName,
    displayName: primary.displayName,
    description: primary.description,
    maxLength: primary.maxLength || 100,
    requiredLevel: primary.requiredLevel || 'ApplicationRequired',
    isPrimaryName: true,
  });

  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: def.schemaName,
    DisplayName: L(def.displayName),
    DisplayCollectionName: L(def.displayCollectionName),
    Description: def.description ? L(def.description) : undefined,
    HasActivities: def.hasActivities ?? false,
    HasNotes: def.hasNotes ?? false,
    IsActivity: false,
    OwnershipType: def.ownershipType || 'UserOwned',
    PrimaryNameAttribute: primary.schemaName.toLowerCase(),
    Attributes: [primaryAttr],
  };
  const r = await client.post('/EntityDefinitions', body);
  if (!r.ok) throw new Error(`Failed to create entity '${def.schemaName}': ${r.status} ${r.text.slice(0, 500)}`);
  return { logical, created: true };
}

async function ensureAttribute(client, entityLogicalName, attr) {
  const attrLogical = attr.schemaName.toLowerCase();
  const exists = await withMetadataRetry(async () => {
    try {
      const found = await attributeExists(client, entityLogicalName, attrLogical);
      return { ok: true, found };
    } catch (e) {
      return { ok: false, text: e.message };
    }
  });
  if (exists.ok && exists.found) return { schemaName: attr.schemaName, created: false };

  const body = typeMetadata(attr);
  const result = await withMetadataRetry(() => client.post(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
    body,
  ));
  if (!result.ok) throw new Error(`Failed to create attribute '${entityLogicalName}.${attr.schemaName}': ${result.status} ${result.text.slice(0, 500)}`);
  return { schemaName: attr.schemaName, created: true };
}

async function ensureLookupRelationship(client, rel) {
  const exists = await relationshipExists(client, rel.schemaName);
  if (exists) return { schemaName: rel.schemaName, created: false };

  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: rel.schemaName,
    ReferencedEntity: rel.referencedEntity,
    ReferencingEntity: rel.referencingEntity,
    AssociatedMenuConfiguration: {
      Behavior: rel.menuBehavior || 'DoNotDisplay',
      Group: 'Details',
      Order: 10000,
    },
    CascadeConfiguration: rel.cascade || {
      Assign: 'NoCascade',
      Delete: 'Restrict',
      Merge: 'NoCascade',
      Reparent: 'NoCascade',
      Share: 'NoCascade',
      Unshare: 'NoCascade',
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      AttributeType: 'Lookup',
      AttributeTypeName: { Value: 'LookupType' },
      SchemaName: rel.lookupSchemaName,
      DisplayName: L(rel.lookupDisplayName),
      Description: rel.lookupDescription ? L(rel.lookupDescription) : undefined,
      RequiredLevel: { Value: rel.required || 'None' },
    },
  };
  const r = await withMetadataRetry(() => client.post('/RelationshipDefinitions', body));
  if (!r.ok) throw new Error(`Failed to create relationship '${rel.schemaName}': ${r.status} ${r.text.slice(0, 500)}`);
  return { schemaName: rel.schemaName, created: true };
}

async function ensureAlternateKey(client, entityLogicalName, key) {
  const existing = await withMetadataRetry(() => client.get(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Keys?$select=LogicalName,SchemaName,KeyAttributes`,
  ));
  // 404 = entity not materialized yet (dry-run skipped the POST, or brief
  // metadata-cache lag after a fresh create). Treat as "no existing keys" —
  // the subsequent POST will either succeed (execute) or dry-log.
  const entityMissing = existing.status === 404 || /does not exist|0x80060888/i.test(existing.text || '');
  if (!existing.ok && !entityMissing) {
    throw new Error(`Failed to list keys for '${entityLogicalName}': ${existing.status} ${existing.text.slice(0, 400)}`);
  }
  const found = existing.ok ? (existing.body?.value || []).find((k) => k.SchemaName === key.schemaName) : null;
  if (found) return { schemaName: key.schemaName, created: false };

  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityKeyMetadata',
    KeyAttributes: key.keyAttributes,
    SchemaName: key.schemaName,
    DisplayName: L(key.displayName || key.schemaName),
  };
  const r = await withMetadataRetry(() => client.post(
    `/EntityDefinitions(LogicalName='${entityLogicalName}')/Keys`,
    body,
  ), { attempts: 8, initialDelayMs: 2000 });
  if (!r.ok) throw new Error(`Failed to create alt-key '${key.schemaName}' on '${entityLogicalName}': ${r.status} ${r.text.slice(0, 500)}`);
  return { schemaName: key.schemaName, created: true };
}

module.exports = {
  ensurePublisher,
  ensureSolution,
  ensureEntity,
  ensureAttribute,
  ensureLookupRelationship,
  ensureAlternateKey,
};
