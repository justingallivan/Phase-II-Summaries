/**
 * Dynamics 365 Service
 *
 * Handles authentication, schema discovery, and data operations
 * against the Dataverse Web API v9.2 (OData).
 *
 * Auth: Client credentials flow (server-to-server).
 * Env vars: DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET
 */

// Hardcoded entity set mapping for known tables — avoids the expensive
// EntityDefinitions API call for every first query in a session.
const KNOWN_ENTITY_SETS = {
  akoya_request: 'akoya_requests',
  akoya_concept: 'akoya_concepts',
  akoya_requestpayment: 'akoya_requestpayments',
  contact: 'contacts',
  account: 'accounts',
  email: 'emails',
  annotation: 'annotations',
  akoya_program: 'akoya_programs',
  akoya_phase: 'akoya_phases',
  akoya_goapplystatustracking: 'akoya_goapplystatustrackings',
  activitypointer: 'activitypointers',
  wmkf_potentialreviewers: 'wmkf_potentialreviewerses',
  wmkf_donors: 'wmkf_donorses',
  wmkf_bbstatus: 'wmkf_bbstatuses',
  wmkf_grantprogram: 'wmkf_grantprograms',
  wmkf_type: 'wmkf_types',
  wmkf_supporttype: 'wmkf_supporttypes',
  wmkf_programlevel2: 'wmkf_programlevel2s',
};

// Reverse map: entity set name → itself (so passing "accounts" also works)
const KNOWN_ENTITY_SET_VALUES = new Set(Object.values(KNOWN_ENTITY_SETS));

// Module-level caches
let tokenCache = { token: null, expiresAt: 0 };
const schemaCache = {
  tables: { data: null, fetchedAt: 0 },
  fields: new Map(),   // tableName → { data, fetchedAt }
  relationships: new Map(),
  entitySetMap: null,   // logicalName → EntitySetName
  entitySetFetchedAt: 0,
};

const TABLE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const FIELD_CACHE_TTL = 6 * 60 * 60 * 1000;  // 6 hours
const API_TIMEOUT = 30_000; // 30 seconds

export class DynamicsService {
  // ───────── Auth ─────────

  /**
   * Get an access token via client credentials grant.
   * Returns a cached token if still valid.
   */
  static async getAccessToken() {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
      return tokenCache.token;
    }

    const {
      DYNAMICS_URL,
      DYNAMICS_TENANT_ID,
      DYNAMICS_CLIENT_ID,
      DYNAMICS_CLIENT_SECRET,
    } = process.env;

    if (!DYNAMICS_URL || !DYNAMICS_TENANT_ID || !DYNAMICS_CLIENT_ID || !DYNAMICS_CLIENT_SECRET) {
      throw new Error('Missing Dynamics 365 environment variables (DYNAMICS_URL, DYNAMICS_TENANT_ID, DYNAMICS_CLIENT_ID, DYNAMICS_CLIENT_SECRET)');
    }

    const tokenUrl = `https://login.microsoftonline.com/${DYNAMICS_TENANT_ID}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DYNAMICS_CLIENT_ID,
      client_secret: DYNAMICS_CLIENT_SECRET,
      scope: `${DYNAMICS_URL}/.default`,
    });

    const resp = await fetchWithTimeout(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Dynamics token request failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  }

  // ───────── Headers ─────────

  static buildHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'odata.include-annotations="*",odata.maxpagesize=100',
    };
  }

  // ───────── Schema Discovery ─────────

  /**
   * Discover entity definitions (tables). Optionally filter by search term.
   */
  static async getEntityDefinitions(searchTerm) {
    const now = Date.now();
    if (schemaCache.tables.data && now - schemaCache.tables.fetchedAt < TABLE_CACHE_TTL) {
      const cached = schemaCache.tables.data;
      return searchTerm ? filterEntities(cached, searchTerm) : cached;
    }

    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;
    const url = `${baseUrl}/api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName,Description,IsCustomEntity,IsActivity&$filter=IsPrivate eq false`;

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      throw new Error(`Failed to fetch entity definitions (${resp.status})`);
    }

    const data = await resp.json();
    const entities = (data.value || []).map(e => ({
      logicalName: e.LogicalName,
      displayName: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
      entitySetName: e.EntitySetName,
      description: e.Description?.UserLocalizedLabel?.Label || '',
      isCustom: e.IsCustomEntity,
      isActivity: e.IsActivity,
    }));

    schemaCache.tables = { data: entities, fetchedAt: now };

    // Also build entity set map
    schemaCache.entitySetMap = new Map();
    schemaCache.entitySetFetchedAt = now;
    for (const e of entities) {
      schemaCache.entitySetMap.set(e.logicalName, e.entitySetName);
    }

    return searchTerm ? filterEntities(entities, searchTerm) : entities;
  }

  /**
   * Get attributes (fields) for a specific entity.
   */
  static async getEntityAttributes(tableName) {
    const now = Date.now();
    const cached = schemaCache.fields.get(tableName);
    if (cached && now - cached.fetchedAt < FIELD_CACHE_TTL) {
      return cached.data;
    }

    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;
    const url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(tableName)}')/Attributes?$select=LogicalName,DisplayName,AttributeType,Description,IsValidForRead,IsValidForCreate,IsValidForUpdate,RequiredLevel`;

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      throw new Error(`Failed to fetch attributes for ${tableName} (${resp.status})`);
    }

    const data = await resp.json();
    const attrs = (data.value || [])
      .filter(a => a.IsValidForRead)
      .map(a => ({
        logicalName: a.LogicalName,
        displayName: a.DisplayName?.UserLocalizedLabel?.Label || a.LogicalName,
        type: a.AttributeType,
        description: a.Description?.UserLocalizedLabel?.Label || '',
        isRequired: a.RequiredLevel?.Value === 'ApplicationRequired' || a.RequiredLevel?.Value === 'SystemRequired',
      }));

    schemaCache.fields.set(tableName, { data: attrs, fetchedAt: now });
    return attrs;
  }

  /**
   * Get relationships (lookups/navigation) for a specific entity.
   */
  static async getEntityRelationships(tableName) {
    const now = Date.now();
    const cached = schemaCache.relationships.get(tableName);
    if (cached && now - cached.fetchedAt < FIELD_CACHE_TTL) {
      return cached.data;
    }

    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;

    // Fetch both many-to-one and one-to-many relationships
    const [manyToOneResp, oneToManyResp] = await Promise.all([
      fetchWithTimeout(
        `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(tableName)}')/ManyToOneRelationships?$select=SchemaName,ReferencedEntity,ReferencingAttribute,ReferencedAttribute`,
        { headers: this.buildHeaders(token) },
        API_TIMEOUT
      ),
      fetchWithTimeout(
        `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${encodeURIComponent(tableName)}')/OneToManyRelationships?$select=SchemaName,ReferencingEntity,ReferencingAttribute,ReferencedAttribute`,
        { headers: this.buildHeaders(token) },
        API_TIMEOUT
      ),
    ]);

    const manyToOne = manyToOneResp.ok ? (await manyToOneResp.json()).value || [] : [];
    const oneToMany = oneToManyResp.ok ? (await oneToManyResp.json()).value || [] : [];

    const rels = {
      manyToOne: manyToOne.map(r => ({
        schemaName: r.SchemaName,
        referencedEntity: r.ReferencedEntity,
        referencingAttribute: r.ReferencingAttribute,
        referencedAttribute: r.ReferencedAttribute,
      })),
      oneToMany: oneToMany.map(r => ({
        schemaName: r.SchemaName,
        referencingEntity: r.ReferencingEntity,
        referencingAttribute: r.ReferencingAttribute,
        referencedAttribute: r.ReferencedAttribute,
      })),
    };

    schemaCache.relationships.set(tableName, { data: rels, fetchedAt: now });
    return rels;
  }

  // ───────── Read Operations ─────────

  /**
   * Query records from an entity set with OData parameters.
   *
   * Safety: enforces $top max of 100 and requires either $filter or $top <= 25.
   */
  static async queryRecords(entitySet, { select, filter, orderby, top, expand } = {}) {
    const effectiveTop = Math.min(top || 25, 100);

    // Safety: require filter or small top
    if (!filter && effectiveTop > 25) {
      throw new Error('Queries without $filter are limited to 25 records. Add a filter or reduce $top.');
    }

    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;
    const params = new URLSearchParams();

    if (select) params.set('$select', select);
    if (filter) params.set('$filter', filter);
    if (orderby) params.set('$orderby', orderby);
    params.set('$top', String(effectiveTop));
    if (expand) params.set('$expand', expand);
    params.set('$count', 'true');

    const url = `${baseUrl}/api/data/v9.2/${entitySet}?${params.toString()}`;

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const errorBody = await resp.text();
      throw new Error(`Query failed (${resp.status}): ${errorBody}`);
    }

    const data = await resp.json();
    const records = (data.value || []).map(r => this.processAnnotations(r));
    const totalCount = data['@odata.count'];

    return {
      records,
      count: records.length,
      totalCount: totalCount !== undefined ? totalCount : records.length,
      hasMore: !!data['@odata.nextLink'],
    };
  }

  /**
   * Get a single record by ID.
   */
  static async getRecord(entitySet, recordId, { select, expand } = {}) {
    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;
    const params = new URLSearchParams();

    if (select) params.set('$select', select);
    if (expand) params.set('$expand', expand);

    const paramStr = params.toString();
    const url = `${baseUrl}/api/data/v9.2/${entitySet}(${recordId})${paramStr ? '?' + paramStr : ''}`;

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const errorBody = await resp.text();
      throw new Error(`Get record failed (${resp.status}): ${errorBody}`);
    }

    const record = await resp.json();
    return this.processAnnotations(record);
  }

  /**
   * Count records in an entity set, optionally with a filter.
   */
  static async countRecords(entitySet, filter) {
    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;

    let url = `${baseUrl}/api/data/v9.2/${entitySet}/$count`;
    if (filter) {
      url += `?$filter=${encodeURIComponent(filter)}`;
    }

    const resp = await fetchWithTimeout(url, {
      headers: this.buildHeaders(token),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const errorBody = await resp.text();
      throw new Error(`Count failed (${resp.status}): ${errorBody}`);
    }

    const text = await resp.text();
    return parseInt(text, 10);
  }

  // ───────── Full-Text Search (Dataverse Search API) ─────────

  /**
   * Full-text search across indexed tables using Dataverse Search.
   * Searches all text fields simultaneously with relevance ranking.
   *
   * @param {string} search - Search term(s)
   * @param {object} options
   * @param {string[]} [options.entities] - Limit to specific table names (e.g. ['akoya_request','contact'])
   * @param {number} [options.top] - Max results (1-100, default 20)
   * @param {string} [options.filter] - OData $filter to narrow results
   * @returns {{ results, totalCount, queryContext }}
   */
  static async searchRecords(search, { entities, top = 20, filter } = {}) {
    const token = await this.getAccessToken();
    const baseUrl = process.env.DYNAMICS_URL;
    const url = `${baseUrl}/api/search/v1.0/query`;

    const body = {
      search,
      top: Math.min(top || 20, 100),
      returntotalrecordcount: true,
    };

    if (entities && entities.length > 0) {
      body.entities = entities; // Simple string array: ["account", "contact"]
    }
    if (filter) {
      body.filter = filter;
    }

    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }, API_TIMEOUT);

    if (!resp.ok) {
      const errorBody = await resp.text();
      throw new Error(`Dataverse Search failed (${resp.status}): ${errorBody}`);
    }

    const data = await resp.json();

    // Normalize the @search.* prefixed response into clean objects
    const results = (data.value || []).map(r => {
      const entity = r['@search.entityname'];
      const objectId = r['@search.objectid'];
      const score = r['@search.score'];
      const highlights = r['@search.highlights'] || {};

      // Collect non-metadata fields as attributes
      const attributes = {};
      for (const [key, value] of Object.entries(r)) {
        if (key.startsWith('@search.') || key === 'ownerid' || key === 'owneridname') continue;
        if (value === null || value === undefined || value === '') continue;
        attributes[key] = value;
      }

      return { entity, objectId, score, highlights, attributes };
    });

    return {
      results,
      totalCount: data.totalrecordcount ?? results.length,
      queryContext: data.querycontext || null,
    };
  }

  // ───────── Write Operations (stubbed) ─────────

  static async createRecord(entitySet, data) {
    throw new Error('Write operations are not yet enabled. Contact a superuser to enable this feature.');
  }

  static async updateRecord(entitySet, recordId, data) {
    throw new Error('Write operations are not yet enabled. Contact a superuser to enable this feature.');
  }

  // ───────── Helpers ─────────

  /**
   * Resolve a logical entity name to its EntitySetName (plural collection name).
   * Accepts either logical name ("account") or entity set name ("accounts").
   */
  static async resolveEntitySetName(logicalName) {
    // 1. Fast path: hardcoded known tables (avoids API call entirely)
    if (KNOWN_ENTITY_SETS[logicalName]) {
      return KNOWN_ENTITY_SETS[logicalName];
    }

    // 2. If the input IS already an entity set name, return it directly
    if (KNOWN_ENTITY_SET_VALUES.has(logicalName)) {
      return logicalName;
    }

    // 3. Check dynamic cache for unknown tables
    if (schemaCache.entitySetMap && Date.now() - schemaCache.entitySetFetchedAt < TABLE_CACHE_TTL) {
      const cached = schemaCache.entitySetMap.get(logicalName);
      if (cached) return cached;
    }

    // 4. Fetch entity definitions to populate cache
    await this.getEntityDefinitions();
    const result = schemaCache.entitySetMap?.get(logicalName);
    if (!result) {
      throw new Error(`Unknown entity: "${logicalName}". Known tables: ${Object.keys(KNOWN_ENTITY_SETS).join(', ')}. Use discover_tables to search for others.`);
    }
    return result;
  }

  /**
   * Process OData annotation values in a record.
   * Annotations like `_fieldid_value@OData.Community.Display.V1.FormattedValue`
   * become `_fieldid_value_formatted`.
   */
  static processAnnotations(record) {
    if (!record || typeof record !== 'object') return record;

    const processed = {};
    const annotationSuffix = '@OData.Community.Display.V1.FormattedValue';
    const msAnnotationSuffix = '@Microsoft.Dynamics.CRM.lookuplogicalname';

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('@odata') || key.startsWith('@Microsoft')) continue;

      if (key.endsWith(annotationSuffix)) {
        const baseKey = key.replace(annotationSuffix, '');
        processed[`${baseKey}_formatted`] = value;
      } else if (key.endsWith(msAnnotationSuffix)) {
        const baseKey = key.replace(msAnnotationSuffix, '');
        processed[`${baseKey}_entity`] = value;
      } else {
        processed[key] = value;
      }
    }

    return processed;
  }

  /**
   * Clear all caches (useful for testing / admin reset).
   */
  static clearCaches() {
    tokenCache = { token: null, expiresAt: 0 };
    schemaCache.tables = { data: null, fetchedAt: 0 };
    schemaCache.fields.clear();
    schemaCache.relationships.clear();
    schemaCache.entitySetMap = null;
    schemaCache.entitySetFetchedAt = 0;
  }
}

// ───────── Private Helpers ─────────

function filterEntities(entities, searchTerm) {
  const term = searchTerm.toLowerCase();
  return entities.filter(e =>
    e.logicalName.toLowerCase().includes(term) ||
    e.displayName.toLowerCase().includes(term) ||
    e.description.toLowerCase().includes(term)
  );
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Dynamics API request timed out after ${timeout / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
