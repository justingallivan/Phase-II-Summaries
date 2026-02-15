/**
 * Prompt templates and tool definitions for Dynamics Explorer
 *
 * Architecture: Search-first discovery with server-side relationship traversal.
 * The system prompt is lean (~800-1000 tokens). Detailed field semantics and
 * rules live in TABLE_ANNOTATIONS and are returned on-demand via describe_table.
 */

/**
 * Annotated schema: per-table field metadata, types, semantic descriptions,
 * and OData rules. Returned by the describe_table tool on demand.
 */
export const TABLE_ANNOTATIONS = {
  akoya_request: {
    description: 'Proposals and grants (5000+). Central hub entity — most queries start here.',
    entitySet: 'akoya_requests',
    fields: {
      akoya_requestnum: 'string — unique request number (e.g. "1001585")',
      akoya_requeststatus: 'string — current status',
      akoya_requesttype: 'string — rarely used legacy field',
      akoya_submitdate: 'datetime — submission date',
      akoya_fiscalyear: 'string — grant cycle label like "June 2025" (NOT calendar year)',
      akoya_paid: 'currency — total amount paid',
      akoya_loireceived: 'datetime — Phase I proposal received date',
      statecode: 'int — record state (0=active, 1=inactive)',
      statuscode: 'int — status reason',
      createdon: 'datetime — record creation date',
      modifiedon: 'datetime — last modified date',
      _akoya_applicantid_value: 'lookup → account — applicant organization',
      _akoya_primarycontactid_value: 'lookup → contact — primary contact person',
      _wmkf_programdirector_value: 'lookup → systemuser — Keck staff program director',
      _wmkf_programcoordinator_value: 'lookup → systemuser — Keck staff coordinator',
      _wmkf_grantprogram_value: 'lookup → wmkf_grantprogram — grant program (11 values: Research, Undergraduate Education, etc.)',
      _akoya_programid_value: 'lookup → akoya_program — GoApply program (24 values including "Bridge Funding"). To find requests by program name, first look up the program GUID in akoya_programs, then filter requests by _akoya_programid_value.',
      _wmkf_type_value: 'lookup → wmkf_type — organizational type code (8 values)',
      wmkf_request_type: 'string — category: concept, phone call, site visit, or grant application',
      wmkf_meetingdate: 'datetime — board meeting date',
      wmkf_numberofyearsoffunding: 'int — years of funding',
      wmkf_numberofconcepts: 'int — concept count',
      wmkf_numberofpayments: 'int — payment count',
      'wmkf_mrconcept1title..4title': 'string — Medical Research concept titles (4 slots)',
      'wmkf_seconcept1title..4title': 'string — Science & Engineering concept titles (4 slots)',
      wmkf_researchconceptstatus: 'string — concept status: active/denied/pending',
      wmkf_conceptcalldate: 'datetime — scheduled concept discussion call',
      wmkf_vendorverified: 'boolean — applicant payment info verified',
      wmkf_phaseiicheckincomplete: 'boolean — Phase II check-in complete',
      wmkf_abstract: 'string — full proposal abstract text (use search tool for keyword discovery)',
      '_wmkf_potentialreviewer1_value..5': 'lookup → wmkf_potentialreviewers — assigned reviewers (5 slots)',
      wmkf_excludedreviewers: 'string — excluded reviewer names and reasons',
    },
    rules: [
      'FISCAL YEAR: akoya_fiscalyear stores labels like "June 2025". When filtering by year, use OR: (contains(akoya_fiscalyear,\'2025\') or (akoya_submitdate ge 2025-01-01T00:00:00Z and akoya_submitdate lt 2026-01-01T00:00:00Z))',
      'Lookup _value fields return GUIDs; _formatted versions auto-return display names. Only $select the _value field — never $select _formatted (causes API error).',
      'Null fields are stripped from results. Only $select fields you will display.',
    ],
  },
  akoya_requestpayment: {
    description: 'Payments and reporting requirements (5000+). Dual-purpose table.',
    entitySet: 'akoya_requestpayments',
    fields: {
      akoya_paymentnum: 'string — unique payment/report number',
      akoya_type: 'boolean — true=reporting requirement, false=payment. CRITICAL for filtering.',
      akoya_amount: 'currency — payment amount',
      akoya_netamount: 'currency — net payment amount',
      akoya_paymentdate: 'datetime — payment date',
      akoya_postingdate: 'datetime — posting date',
      akoya_estimatedgrantpaydate: 'datetime — estimated payment date',
      akoya_requirementdue: 'datetime — report due date',
      akoya_requirementtype: 'int option set — interim or final. Do NOT filter as string; query records first to find valid integer codes.',
      akoya_folio: 'string — payment status',
      wmkf_reporttype: 'int option set — detailed report type. Do NOT filter as string.',
      statecode: 'int — record state',
      statuscode: 'int — status reason',
      createdon: 'datetime — record creation date',
      _akoya_requestlookup_value: 'lookup → akoya_request — parent request',
      _akoya_requestapplicant_value: 'lookup → account — applicant organization',
      _akoya_requestcontact_value: 'lookup → contact — contact person',
      _akoya_payee_value: 'lookup → account — payee organization',
    },
    rules: [
      'Use akoya_type eq false for payments only, akoya_type eq true for reporting requirements only.',
      'Option set fields (akoya_requirementtype, wmkf_reporttype) are integers. To find valid codes, query a few records and inspect the _formatted values.',
    ],
  },
  contact: {
    description: 'People — contacts associated with organizations and requests (5000+).',
    entitySet: 'contacts',
    fields: {
      fullname: 'string — full name',
      firstname: 'string — first name',
      lastname: 'string — last name',
      emailaddress1: 'string — primary email',
      jobtitle: 'string — job title',
      telephone1: 'string — phone number',
      akoya_contactnum: 'string — unique contact number',
      statecode: 'int — record state',
      contactid: 'guid — primary key',
      createdon: 'datetime — record creation date',
    },
    rules: [],
  },
  account: {
    description: 'Organizations — universities, institutions, companies (4500+).',
    entitySet: 'accounts',
    fields: {
      name: 'string — organization name (may be legal name or common name)',
      akoya_aka: 'string — common/short name (e.g. "Stanford University" when name is the legal entity). 95% populated.',
      wmkf_legalname: 'string — official legal/incorporated name. 83% populated.',
      wmkf_dc_aka: 'string — abbreviations and alternate names (e.g. "MRN", "MGH"). 21% populated.',
      wmkf_formerlyknownas: 'string — historical names after rebranding. Sparse.',
      akoya_constituentnum: 'string — unique organization ID',
      akoya_totalgrants: 'currency — total grant amount',
      akoya_countofawards: 'int — number of awards',
      akoya_countofrequests: 'int — number of requests',
      wmkf_countofprogramgrants: 'int — program grant count',
      wmkf_countofconcepts: 'int — concept count',
      wmkf_countofdiscretionarygrant: 'int — discretionary grant count',
      wmkf_sumofprogramgrants: 'currency — sum of program grants',
      wmkf_sumofdiscretionarygrants: 'currency — sum of discretionary grants',
      wmkf_eastwest: 'string — geographic region: east/west US',
      wmkf_financialstatementsneeded: 'boolean — needs financial statements',
      wmkf_bmf509: 'string — IRS 509(a) status',
      wmkf_bmfsubsectiondescription: 'string — IRS subsection',
      address1_city: 'string — city',
      address1_stateorprovince: 'string — state',
      websiteurl: 'string — website',
      telephone1: 'string — phone number',
      akoya_institutiontype: 'string — institution type',
      accountid: 'guid — primary key',
      createdon: 'datetime — record creation date',
    },
    rules: [
      'When searching by name with contains(), multiple orgs may match (e.g. "University of Chicago" matches "Loyola University Of Chicago"). Prefer exact match.',
      'Many orgs use legal names different from their common names. get_entity searches both name and akoya_aka automatically. E.g. "Stanford University" (akoya_aka) matches "The Board of Trustees of the Leland Stanford Junior University" (name).',
    ],
  },
  email: {
    description: 'Email activities linked to requests (5000+).',
    entitySet: 'emails',
    fields: {
      subject: 'string — email subject',
      description: 'string — email body (HTML)',
      sender: 'string — sender address',
      torecipients: 'string — recipients',
      createdon: 'datetime — record creation date',
      directioncode: 'boolean — true=outgoing, false=incoming',
      statecode: 'int — record state',
      activityid: 'guid — primary key',
      _regardingobjectid_value: 'lookup — linked request or record',
    },
    rules: [
      'DATE FILTERING: The "senton" field is NULL for all incoming emails. ALWAYS filter by "createdon" (not senton) to capture both incoming and outgoing.',
    ],
  },
  annotation: {
    description: 'Notes and attachments on records (5000+).',
    entitySet: 'annotations',
    fields: {
      subject: 'string — note subject',
      notetext: 'string — note body text',
      filename: 'string — attachment filename',
      mimetype: 'string — attachment MIME type',
      filesize: 'int — attachment size in bytes',
      isdocument: 'boolean — has attachment',
      createdon: 'datetime — record creation date',
      annotationid: 'guid — primary key',
      _objectid_value: 'lookup — parent record',
    },
    rules: [],
  },
  wmkf_potentialreviewers: {
    description: 'Reviewer pool (3141). Linked to requests via 5 reviewer slots.',
    entitySet: 'wmkf_potentialreviewerses',
    fields: {
      wmkf_name: 'string — full name',
      wmkf_firstname: 'string — first name',
      wmkf_lastname: 'string — last name',
      wmkf_title: 'string — title/position',
      wmkf_emailaddress: 'string — email',
      wmkf_organizationname: 'string — organization',
      wmkf_areaofexpertise: 'string — area of expertise',
      wmkf_potentialreviewersid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_grantprogram: {
    description: 'Grant program lookup (11 values).',
    entitySet: 'wmkf_grantprograms',
    fields: {
      wmkf_name: 'string — program name',
      wmkf_code: 'string — program code',
      wmkf_grantprogramid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_type: {
    description: 'Organizational type codes (8 values).',
    entitySet: 'wmkf_types',
    fields: {
      wmkf_name: 'string — type name',
      wmkf_typeid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_bbstatus: {
    description: 'Status codes (88 values).',
    entitySet: 'wmkf_bbstatuses',
    fields: {
      wmkf_name: 'string — status name',
      wmkf_bbcode: 'string — status code',
      wmkf_requesttype: 'string — request type',
      wmkf_bbstatusid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_donors: {
    description: 'Donor codes (116 values).',
    entitySet: 'wmkf_donorses',
    fields: {
      wmkf_name: 'string — donor name',
      wmkf_code: 'string — donor code',
      wmkf_donorsid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_supporttype: {
    description: 'Support types (41 values).',
    entitySet: 'wmkf_supporttypes',
    fields: {
      wmkf_name: 'string — support type name',
      wmkf_supporttypeid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_programlevel2: {
    description: 'Program sub-categories (29 values).',
    entitySet: 'wmkf_programlevel2s',
    fields: {
      wmkf_name: 'string — program level 2 name',
      wmkf_programlevel2id: 'guid — primary key',
    },
    rules: [],
  },
  akoya_program: {
    description: 'GoApply program definitions (24 values, e.g. "Bridge Funding", "Phase II", "Phase I"). Linked to requests via _akoya_programid_value.',
    entitySet: 'akoya_programs',
    fields: {
      akoya_program: 'string — program name (e.g. "Bridge Funding")',
      wmkf_code: 'string — program code',
      wmkf_alternatename: 'string — alternate name',
      akoya_programid: 'guid — primary key. Use this GUID to filter requests: _akoya_programid_value eq {guid}',
    },
    rules: [
      'To find requests by program name: 1) query akoya_programs with contains(akoya_program,\'name\') to get the GUID, 2) query akoya_requests with _akoya_programid_value eq {guid}.',
    ],
  },
  akoya_phase: {
    description: 'GoApply application phases (62 values).',
    entitySet: 'akoya_phases',
    fields: {
      akoya_phasename: 'string — phase name',
      akoya_phaseorder: 'int — display order',
      akoya_phasetype: 'string — phase type',
      akoya_totalsubmissions: 'int — submission count',
      akoya_totalawarded: 'int — award count',
      _akoya_application_value: 'lookup → akoya_program — parent program',
    },
    rules: [],
  },
  akoya_goapplystatustracking: {
    description: 'GoApply status tracking (3293 records).',
    entitySet: 'akoya_goapplystatustrackings',
    fields: {
      akoya_id: 'string — tracking ID',
      akoya_applicantemail: 'string — applicant email',
      akoya_currentphasestatus: 'string — current phase status',
      akoya_duedate: 'datetime — due date',
      akoya_progress: 'string — progress',
      _akoya_request_value: 'lookup → akoya_request — linked request',
    },
    rules: [],
  },
  activitypointer: {
    description: 'All activity types — emails, tasks, appointments, etc. (5000+).',
    entitySet: 'activitypointers',
    fields: {
      subject: 'string — activity subject',
      activitytypecode: 'string — activity type (email, task, etc.)',
      createdon: 'datetime — record creation date',
      statecode: 'int — record state',
      activityid: 'guid — primary key',
      _regardingobjectid_value: 'lookup — linked record',
    },
    rules: [],
  },
};

/**
 * Tables whose schemas are inlined in the system prompt to save a
 * describe_table round-trip. Covers ~80% of queries.
 */
const INLINE_SCHEMA_TABLES = ['akoya_request', 'account', 'contact', 'akoya_requestpayment'];

/**
 * Generate compact inline schema text for the top tables.
 * Format: "table (entitySet) — description\n  field: type — desc\n  RULES: ..."
 */
function buildInlineSchemas() {
  return INLINE_SCHEMA_TABLES.map(name => {
    const t = TABLE_ANNOTATIONS[name];
    const fields = Object.entries(t.fields)
      .map(([f, desc]) => `  ${f}: ${desc}`)
      .join('\n');
    const rules = t.rules.length > 0
      ? '\n  RULES:\n' + t.rules.map(r => `  - ${r}`).join('\n')
      : '';
    return `${name} (${t.entitySet}) — ${t.description}\n${fields}${rules}`;
  }).join('\n\n');
}

/**
 * Build the system prompt with inline schemas for top tables.
 * Detailed field semantics for other tables live in TABLE_ANNOTATIONS,
 * returned on-demand via describe_table.
 */
export function buildSystemPrompt({ userRole = 'read_only', restrictions = [] } = {}) {
  const restrictionBlock = restrictions.length > 0
    ? `\nRESTRICTED: ${restrictions.map(r =>
        r.field_name ? `${r.table_name}.${r.field_name}` : r.table_name
      ).join(', ')}`
    : '';

  const inlineSchemas = buildInlineSchemas();

  return `CRM assistant for W. M. Keck Foundation Dynamics 365. Role: ${userRole}.${restrictionBlock}

TOOLS — choose the right one:
- search: keyword/topic discovery across all tables ("find grants about fungi")
- get_entity: fetch one record by name, number, or GUID ("tell me about request 1001585", "look up Stanford")
- get_related: follow relationships — use for ANY "show me X for Y" query ("requests from Stanford", "emails for Stanford", "payments for request 1001585", "reviewers for request 1001585")
- describe_table: understand field names/types/meanings BEFORE building OData queries. Call ONLY for tables NOT listed in INLINE SCHEMAS below.
- query_records: structured OData queries (date ranges, exact filters, aggregation). For tables in INLINE SCHEMAS, you already know the fields — query directly.
- count_records: count records with optional filter
- find_reports_due: all reporting requirements in a date range
- export_csv: generate a downloadable Excel file for large result sets. Requires $filter. Use when user asks to export, download, or wants the full dataset.

RULES:
- Complete the task in as FEW tool calls as possible.
- NEVER fabricate data. Only present what tools return.
- For tables in INLINE SCHEMAS below, you already have full field details — query directly without describe_table.
- For OTHER tables, ALWAYS call describe_table BEFORE your first query_records. Do NOT guess field names — they are non-obvious (e.g. akoya_requestnum NOT akoya_requestnumber, akoya_program NOT akoya_name).
- For org name lookups, review ALL results and pick the exact match.
- Present results as markdown tables. Show totalCount if results are truncated.
- When the user asks to "export", "download", "spreadsheet", or wants the full dataset, use export_csv. It fetches ALL matching records (up to 5000) and generates a downloadable Excel file.
- OData syntax: eq, ne, contains(field,'text'), gt, lt, ge, le, and, or, not. Dates: 2024-01-01T00:00:00Z
- Lookup tables (like akoya_program, wmkf_grantprogram): to filter requests by program name, first query the lookup table to get the GUID, then filter requests by the _value lookup field. Example: "Bridge Funding" → query akoya_programs for GUID → filter akoya_requests by _akoya_programid_value eq {guid}.

TABLES:
akoya_request (5000+) proposals/grants — central hub
akoya_requestpayment (5000+) payments & reporting requirements
contact (5000+) people
account (4500+) organizations
email (5000+) email activities
annotation (5000+) notes/attachments
wmkf_potentialreviewers (3141) reviewers
Lookup: wmkf_grantprogram(11), wmkf_type(8), wmkf_bbstatus(88), wmkf_donors(116), wmkf_supporttype(41), wmkf_programlevel2(29), akoya_program(24), akoya_phase(62), akoya_goapplystatustracking(3293), activitypointer(5000+)

FIELD NAMING: "akoya_" = vendor fields. "wmkf_" = Keck Foundation custom fields.

INLINE SCHEMAS (no describe_table needed for these):
${inlineSchemas}`;
}

/**
 * Claude tool definitions — 7 tools for the search-first architecture.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'search',
    description: 'Full-text search across all indexed tables (requests, contacts, accounts, notes, etc.). Searches titles, abstracts, names, and other text fields simultaneously with relevance ranking. Use for keyword/topic searches. Returns matched records with highlighted text.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term(s). Supports stemming and fuzzy matching.' },
        entities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: limit to specific tables (e.g. ["akoya_request","contact"])',
        },
        top: { type: 'integer', description: '1-100, default 20' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_entity',
    description: 'Find one entity by name, number, or GUID. Returns full details with resolved lookup display names.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['account', 'request', 'contact', 'reviewer', 'email', 'payment'],
          description: 'Entity type to look up',
        },
        identifier: { type: 'string', description: 'Name, number, or GUID' },
      },
      required: ['type', 'identifier'],
    },
  },
  {
    name: 'get_related',
    description: 'Follow relationships from a source entity. Handles multi-step lookups server-side. Paths: account→requests/emails/payments/reports, request→payments/reports/emails/annotations/reviewers, contact→requests, reviewer→requests. Use for ANY "show me X for Y" query.',
    input_schema: {
      type: 'object',
      properties: {
        source_type: {
          type: 'string',
          enum: ['account', 'request', 'contact', 'reviewer'],
          description: 'Source entity type',
        },
        source_id: { type: 'string', description: 'GUID from a previous result' },
        source_name: { type: 'string', description: 'Name or number (alternative to source_id — tool resolves it)' },
        target_type: {
          type: 'string',
          enum: ['requests', 'payments', 'reports', 'emails', 'annotations', 'reviewers'],
          description: 'Related entity type to retrieve',
        },
        date_from: { type: 'string', description: 'Optional ISO date filter start (e.g. 2025-01-01T00:00:00Z)' },
        date_to: { type: 'string', description: 'Optional ISO date filter end' },
      },
      required: ['source_type', 'target_type'],
    },
  },
  {
    name: 'describe_table',
    description: 'Get field names, types, meanings, and OData rules for a table. Call BEFORE constructing query_records filters. If table name is unknown, returns list of all available tables.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Table to describe (e.g. "akoya_request"). Omit or pass unknown name to get table listing.' },
      },
      required: [],
    },
  },
  {
    name: 'query_records',
    description: 'OData query. Null fields stripped. Use $select with ONLY the fields you need — fewer fields = more records fit. Call describe_table first if unsure about field names.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        select: { type: 'string', description: 'Comma-separated fields. IMPORTANT: only select fields you will display.' },
        filter: { type: 'string', description: 'OData $filter' },
        orderby: { type: 'string', description: 'OData $orderby' },
        top: { type: 'integer', description: '1-100, default 50' },
        expand: { type: 'string', description: 'OData $expand' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'count_records',
    description: 'Count records, optionally filtered.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filter: { type: 'string', description: 'OData $filter' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'find_reports_due',
    description: 'Find all reporting requirements due in a date range. Returns report#, due date, type, request#, organization, and status.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date (ISO format, e.g. 2026-02-01T00:00:00Z)' },
        date_to: { type: 'string', description: 'End date exclusive (ISO format, e.g. 2026-03-01T00:00:00Z)' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'export_csv',
    description: 'Export query results as a downloadable Excel file. Use when user asks to export, download, or save data, or when a large dataset is needed. Fetches ALL matching records (up to 5000) and generates an .xlsx file. Requires $filter.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Table to export from (e.g. "akoya_request")' },
        select: { type: 'string', description: 'Comma-separated fields to include as columns' },
        filter: { type: 'string', description: 'OData $filter (required — no unfiltered dumps)' },
        orderby: { type: 'string', description: 'OData $orderby' },
        filename: { type: 'string', description: 'Download filename (without extension, e.g. "proposals-2025"). Auto-generated if omitted.' },
      },
      required: ['table_name', 'select', 'filter'],
    },
  },
];
