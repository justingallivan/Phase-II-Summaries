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
      akoya_requeststatus: 'string — overall request status ("Concept Pending", "Phase I Declined", "Phase II Pending", "Active", "Closed", etc.). Determines lifecycle stage.',
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
      _akoya_primarycontactid_value: 'lookup → contact — liaison / primary contact at institution',
      _wmkf_programdirector_value: 'lookup → systemuser — Keck staff program director',
      _wmkf_programcoordinator_value: 'lookup → systemuser — Keck staff coordinator',
      _wmkf_grantprogram_value: 'lookup → wmkf_grantprogram — broad grant program category (11 values: Research, Southern California, Undergraduate Education, etc.). "SoCal" = "Southern California" here.',
      _akoya_programid_value: 'lookup → akoya_program — specific GoApply program (24 values: "Science and Engineering Research" = S&E, "Medical Research" = MR, etc.). To find requests by program name, first look up the program GUID in akoya_programs, then filter requests by _akoya_programid_value.',
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
      wmkf_phaseistatus: 'string — Phase I outcome (Invited, Not Invited, Ineligible, Request Withdrawn)',
      wmkf_phaseiistatus: 'string — Phase II outcome (Approved, Phase II Declined, Phase II Pending Committee Review, Phase II Withdrawn)',
      akoya_request: 'currency — "the ask" / amount requested from Keck',
      akoya_expenses: 'currency — total project cost / total budget (including cost share)',
      akoya_grant: 'currency — award / grant amount (how much Keck gave)',
      akoya_balance: 'currency — remaining balance on grant',
      akoya_originalgrantamount: 'currency — original approved grant amount',
      akoya_decisiondate: 'datetime — board decision date',
      akoya_begindate: 'datetime — grant start / begin date',
      akoya_enddate: 'datetime — grant end date',
      _wmkf_projectleader_value: 'lookup → contact — PI / principal investigator / researcher',
      _wmkf_researchleader_value: 'lookup → contact — VPR / VP for research / top research official at institution',
      _wmkf_ceo_value: 'lookup → contact — CEO / president / chancellor of institution',
      _wmkf_authorizedofficial_value: 'lookup → contact — authorized official / signing authority',
      _wmkf_paymentcontact_value: 'lookup → contact — payment contact',
      '_wmkf_copi1_value..5': 'lookup → contact — co-PIs (5 slots)',
      _wmkf_programdirector2_value: 'lookup → systemuser — secondary program director',
      wmkf_abstract: 'string — full proposal abstract text (use search tool for keyword discovery)',
      '_wmkf_potentialreviewer1_value..5': 'lookup → wmkf_potentialreviewers — assigned reviewers (5 slots)',
      wmkf_excludedreviewers: 'string — excluded reviewer names and reasons',
    },
    rules: [
      'FISCAL YEAR: akoya_fiscalyear stores labels like "June 2025". When filtering by year, use OR: (contains(akoya_fiscalyear,\'2025\') or (akoya_submitdate ge 2025-01-01T00:00:00Z and akoya_submitdate lt 2026-01-01T00:00:00Z))',
      'Lookup _value fields return GUIDs; _formatted versions auto-return display names. Only $select the _value field — never $select _formatted (causes API error).',
      'Null fields are stripped from results. Only $select fields you will display.',
      'PROGRAM DIRECTOR: _wmkf_programdirector_value is a lookup to systemuser. To filter by director name, first query systemusers to get the GUID, then filter requests by _wmkf_programdirector_value eq {guid}.',
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
  systemuser: {
    description: 'Keck Foundation staff / Dynamics users (212). Linked to requests via _wmkf_programdirector_value and _wmkf_programcoordinator_value.',
    entitySet: 'systemusers',
    fields: {
      fullname: 'string — full name (e.g. "Justin Gallivan")',
      firstname: 'string — first name',
      lastname: 'string — last name',
      internalemailaddress: 'string — email address',
      systemuserid: 'guid — primary key. Use this GUID to filter requests: _wmkf_programdirector_value eq {guid}',
      isdisabled: 'boolean — true if account disabled',
    },
    rules: [
      'To find requests by program director name: 1) query systemusers with contains(fullname,\'name\') to get the GUID, 2) filter akoya_requests by _wmkf_programdirector_value eq {guid}.',
    ],
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
- export_csv: generate a downloadable Excel file for large result sets. Requires $filter. Use when user asks to export, download, or wants the full dataset. Supports AI processing via process_instruction — adds AI-generated columns to each record.

RULES:
- Complete the task in as FEW tool calls as possible.
- NEVER fabricate data. Only present what tools return.
- For tables in INLINE SCHEMAS below, you already have full field details — query directly without describe_table.
- For OTHER tables, ALWAYS call describe_table BEFORE your first query_records. Do NOT guess field names — they are non-obvious (e.g. akoya_requestnum NOT akoya_requestnumber, akoya_program NOT akoya_name).
- For org name lookups, review ALL results and pick the exact match.
- Present results as markdown tables. Show totalCount if results are truncated.
- When the user asks to "export", "download", "spreadsheet", or wants the full dataset, use export_csv. It fetches ALL matching records (up to 5000) and generates a downloadable Excel file.
- AI-processed exports: when the user wants AI analysis on exported data (e.g., "export with keywords extracted"), use export_csv with process_instruction. The tool returns a cost/time estimate and sample output. Present the estimate to the user (count, sample, cost, time) and ask for confirmation. Only after the user confirms, call export_csv again with the SAME parameters plus confirmed: true.
- OData syntax: eq, ne, contains(field,'text'), gt, lt, ge, le, and, or, not. Dates: 2024-01-01T00:00:00Z
- Lookup tables (like akoya_program, wmkf_grantprogram): to filter requests by program name, first query the lookup table to get the GUID, then filter requests by the _value lookup field. Example: "Bridge Funding" → query akoya_programs for GUID → filter akoya_requests by _akoya_programid_value eq {guid}.

VOCABULARY — staff terms → correct fields:
Status:
- "status" → akoya_requeststatus (overall: "Phase II Pending", "Active", "Closed", etc.)
- "Phase I status/outcome" → wmkf_phaseistatus (Invited, Not Invited, Ineligible, Request Withdrawn)
- "Phase II status/outcome" → wmkf_phaseiistatus (Approved, Phase II Declined, Phase II Pending Committee Review, Phase II Withdrawn)
Programs:
- "program" usually means S&E, MR, or SoCal
- "S&E"/"SE"/"science and engineering" → _akoya_programid_value = "Science and Engineering Research"
- "MR"/"medical research" → _akoya_programid_value = "Medical Research"
- "SoCal"/"Southern California" → _wmkf_grantprogram_value = "Southern California" (broad category, NOT akoya_program)
- Hierarchy: wmkf_grantprogram (broad: Research, Southern California) → akoya_program (specific: S&E, MR, Civic & Community, Health Care, etc.)
People (external — at institution):
- "PI"/"researcher"/"principal investigator" → _wmkf_projectleader_value
- "liaison"/"primary contact" → _akoya_primarycontactid_value
- "VPR"/"VP for research" → _wmkf_researchleader_value
- "CEO"/"president"/"chancellor" → _wmkf_ceo_value
- "authorized official" → _wmkf_authorizedofficial_value
- "payment contact" → _wmkf_paymentcontact_value
- "co-PI" → _wmkf_copi1_value.._wmkf_copi5_value
People (internal — Keck staff):
- "PD"/"program director" → _wmkf_programdirector_value (systemuser)
- "PC"/"coordinator" → _wmkf_programcoordinator_value (systemuser)
Money:
- "the ask"/"amount requested" → akoya_request (currency field, what they want from Keck)
- "total project cost"/"total budget" → akoya_expenses (full cost including cost share)
- "award"/"grant amount"/"how much did we give" → akoya_grant
- "paid"/"disbursed" → akoya_paid
- "balance"/"remaining" → akoya_balance
Dates:
- "Phase I submitted"/"LOI date" → akoya_loireceived
- "Phase II submitted"/"submitted" → akoya_submitdate
- "concept call" → wmkf_conceptcalldate
- "board meeting" → wmkf_meetingdate
- "decision date" → akoya_decisiondate
- "grant start"/"begin date" → akoya_begindate
- "grant end"/"end date" → akoya_enddate
Request lifecycle:
- Three types: research concept → Phase I proposal → Phase II proposal
- Type determined by akoya_requeststatus (e.g. "Concept Pending", "Phase I Declined", "Phase II Pending", "Active")
- Concepts are standalone records — NOT linked to subsequent Phase I proposals. To find a concept for a proposal, search for requests from the same applicant with "Concept" status around the right timeframe.

TABLES:
akoya_request (5000+) proposals/grants — central hub
akoya_requestpayment (5000+) payments & reporting requirements
contact (5000+) people
account (4500+) organizations
email (5000+) email activities
annotation (5000+) notes/attachments
wmkf_potentialreviewers (3141) reviewers
systemuser (212) Keck staff — linked to requests via program director/coordinator
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
          enum: ['account', 'request', 'contact', 'reviewer', 'email', 'payment', 'staff'],
          description: 'Entity type to look up. Use "staff" for Keck Foundation staff / system users (program directors, coordinators).',
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
    description: 'Export query results as a downloadable Excel file. Use when user asks to export, download, or save data, or when a large dataset is needed. Fetches ALL matching records (up to 5000) and generates an .xlsx file. Requires $filter. Supports AI processing: set process_instruction to add AI-generated columns (returns estimate first; call again with confirmed: true to execute).',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Table to export from (e.g. "akoya_request")' },
        select: { type: 'string', description: 'Comma-separated fields to include as columns' },
        filter: { type: 'string', description: 'OData $filter (required — no unfiltered dumps)' },
        orderby: { type: 'string', description: 'OData $orderby' },
        filename: { type: 'string', description: 'Download filename (without extension, e.g. "proposals-2025"). Auto-generated if omitted.' },
        process_instruction: { type: 'string', description: 'AI task to run per record (e.g. "extract 5 keywords from the abstract"). Adds AI-generated columns to the export. First call returns a cost estimate; call again with confirmed: true to execute.' },
        confirmed: { type: 'boolean', description: 'Set to true after the user approves the AI processing estimate. Only used with process_instruction.' },
      },
      required: ['table_name', 'select', 'filter'],
    },
  },
];
