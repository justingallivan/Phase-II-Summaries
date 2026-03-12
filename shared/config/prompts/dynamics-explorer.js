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
    description: 'Universal record table (25,000+). Holds grant applications, concepts, site visits, office visits, and phone calls. Use wmkf_request_type to filter. Most queries start here.',
    entitySet: 'akoya_requests',
    fields: {
      akoya_requestid: 'guid — primary key',
      akoya_requestnum: 'string — unique request number (e.g. "1001585")',
      akoya_requeststatus: 'string — meta status showing pipeline position. Values: "Concept Pending", "Concept Done", "Concept Ineligible", "Concept Denied", "Phase I Pending", "Phase I Incomplete", "Phase I Ineligible", "Phase I Declined", "Phase I Withdrawn", "Proposal Invited" (transient), "Phase II Pending", "Phase II Deferred", "Phase II Declined", "Phase II Withdrawn", "Active", "Rescinded", "Closed", "Approved", "Denied", "Pending", "Withdrawn"',
      wmkf_request_type: 'int option set — record type. 100000000="Concept" (3K), 100000001="Request" (16K grant applications), plus "Office Visit" (2.8K), "Site Visit" (1.5K), "Phone Call" (914), "Individual" (86). DEFAULT: filter to wmkf_request_type eq 100000001 unless user asks for concepts, visits, or all records.',
      akoya_requesttype: 'string — vendor field, nearly always "Grant". Ignore.',
      akoya_title: 'string — proposal/project title',
      akoya_submitdate: 'datetime — Phase II submission date',
      akoya_fiscalyear: 'string — grant cycle label like "June 2025" (NOT calendar year)',
      akoya_loireceived: 'datetime — Phase I proposal (Letter of Inquiry) received date',
      // Status fields
      wmkf_phaseistatus: 'string — Phase I outcome: "Invited", "Not Invited", " Ineligible" (note leading space in data), "Request Withdrawn", "Rescinded Grant", "Incomplete", "Pending Committee Review", "Recommended Invite"',
      wmkf_phaseiistatus: 'string — Phase II outcome: "Approved", "Phase II Declined", "Phase II Pending Committee Review", "Phase II Withdrawn", "Phase II Deferred"',
      wmkf_researchconceptstatus: 'string — Research concept call status: "Completed", "Scheduled", "Denied", "Ineligible", "Pending", "Incomplete"',
      wmkf_socalconceptstatus: 'string — SoCal concept call status: "Completed", "Phone Call", "Unlikely to be Competitive", "Competitive, Apply", "Scheduled Call", "Ineligible", "Fit, but Wait", "Pending"',
      wmkf_contingencystatus: 'int option set — contingent payment status: 682090000="Not Met", 682090001="Met", 682090002="Paid". Only ~20 requests use this.',
      // Money
      akoya_request: 'currency — "the ask" / amount requested from Keck',
      akoya_expenses: 'currency — total project cost / total budget (including cost share)',
      akoya_grant: 'currency — award / grant amount (how much Keck gave)',
      akoya_paid: 'currency — total amount paid/disbursed',
      akoya_balance: 'currency — remaining balance on grant',
      akoya_originalgrantamount: 'currency — original approved grant amount',
      akoya_recommendedamount: 'currency — staff-recommended grant amount',
      wmkf_invitedamount: 'currency — invited amount for Phase II',
      // Dates
      wmkf_meetingdate: 'datetime — board meeting date',
      akoya_decisiondate: 'datetime — board decision date',
      akoya_begindate: 'datetime — grant start / begin date',
      akoya_enddate: 'datetime — grant end date',
      wmkf_conceptcalldate: 'datetime — scheduled concept discussion call',
      createdon: 'datetime — record creation date',
      modifiedon: 'datetime — last modified date',
      statecode: 'int — record state (0=active, 1=inactive)',
      statuscode: 'int — status reason',
      // Counts
      wmkf_numberofyearsoffunding: 'int — years of funding',
      wmkf_numberofconcepts: 'int — concept count',
      wmkf_numberofpayments: 'int — payment count',
      // Concept titles
      'wmkf_mrconcept1title..4title': 'string — Medical Research concept titles (4 slots)',
      'wmkf_seconcept1title..4title': 'string — Science & Engineering concept titles (4 slots)',
      // Organizations and people (external)
      _akoya_applicantid_value: 'lookup → account — applicant institution (grantee)',
      _akoya_primarycontactid_value: 'lookup → contact — liaison / primary contact at institution',
      _wmkf_projectleader_value: 'lookup → contact — PI / principal investigator / researcher',
      _wmkf_researchleader_value: 'lookup → contact — VPR / VP for research / top research official at institution',
      _wmkf_ceo_value: 'lookup → contact — CEO / president / chancellor of institution',
      _wmkf_authorizedofficial_value: 'lookup → contact — authorized official / signing authority',
      _wmkf_paymentcontact_value: 'lookup → contact — payment contact',
      '_wmkf_copi1_value..5': 'lookup → contact — co-PIs (5 slots)',
      // Payment routing
      _akoya_payee_value: 'lookup → account — payee organization (if different from applicant due to tax status)',
      wmkf_usingpayee: 'boolean — true if grant uses an alternate payee organization',
      _wmkf_donorname_value: 'lookup → wmkf_donors — donor fund source',
      // Keck staff (internal)
      _wmkf_programdirector_value: 'lookup → systemuser — Keck staff program director',
      _wmkf_programdirector2_value: 'lookup → systemuser — secondary program director',
      _wmkf_programcoordinator_value: 'lookup → systemuser — Keck staff coordinator',
      // Classification
      _wmkf_grantprogram_value: 'lookup → wmkf_grantprogram — broad grant program (11 values: Research, Southern California, Undergraduate Education, Discretionary, etc.)',
      _akoya_programid_value: 'lookup → akoya_program — specific internal program (24 values: S&E, MR, Health Care, etc.). To find requests by program name, first look up the program GUID in akoya_programs, then filter.',
      _wmkf_type_value: 'lookup → wmkf_type — request type classification (8 values: Program, Discretionary, Site Visit, etc.). Many-to-many with grant program in practice.',
      // Flags
      wmkf_vendorverified: 'boolean — applicant payment info verified via GOverify',
      wmkf_phaseiicheckincomplete: 'boolean — Phase II check-in complete',
      // Reviewers
      '_wmkf_potentialreviewer1_value..5': 'lookup → wmkf_potentialreviewers — assigned reviewers (5 slots)',
      wmkf_excludedreviewers: 'string — excluded reviewer names and reasons',
      // Text
      wmkf_abstract: 'string — full proposal abstract text (use search tool for keyword discovery)',
    },
    rules: [
      'DEFAULT FILTER: Unless the user explicitly asks about concepts, site visits, office visits, phone calls, or "all records", ALWAYS add wmkf_request_type eq 100000001 to filter to grant applications only. This excludes ~9K non-grant records.',
      'FISCAL YEAR: akoya_fiscalyear stores labels like "June 2025". When filtering by year, use OR: (contains(akoya_fiscalyear,\'2025\') or (akoya_submitdate ge 2025-01-01T00:00:00Z and akoya_submitdate lt 2026-01-01T00:00:00Z))',
      'Lookup _value fields return GUIDs; _formatted versions auto-return display names. Only $select the _value field — never $select _formatted (causes API error).',
      'Null fields are stripped from results. Only $select fields you will display.',
      'PROGRAM DIRECTOR: _wmkf_programdirector_value is a lookup to systemuser. To filter by director name, first query systemusers to get the GUID, then filter requests by _wmkf_programdirector_value eq {guid}.',
      'PHASE I STATUS: " Ineligible" has a leading space in the data (589 records). Use contains() or exact match with the space.',
    ],
  },
  akoya_requestpayment: {
    description: 'Payments and reporting requirements (22,500+). Single table, two unrelated record types split by akoya_type. Payments (9K) track disbursements. Requirements (13K) track reporting obligations.',
    entitySet: 'akoya_requestpayments',
    fields: {
      akoya_paymentnum: 'string — unique payment/report number',
      akoya_type: 'boolean — true="Requirement" (reporting obligation), false="Payment" (disbursement). CRITICAL for filtering — these are unrelated record types sharing a table.',
      // Payment fields
      akoya_amount: 'currency — payment amount',
      akoya_netamount: 'currency — net payment amount',
      akoya_paymentdate: 'datetime — actual payment date',
      akoya_postingdate: 'datetime — posting/accounting date',
      akoya_estimatedgrantpaydate: 'datetime — estimated future payment date',
      akoya_folio: 'string — payment status: "Paid", "Scheduled" (known future date), "Contingent" (awaiting condition per wmkf_contingencystatus on request), "Void", "Refund", "Ready To Pay". Note: case inconsistency in data ("Paid"/"PAID").',
      akoya_alternatepayee: 'boolean — true if payment goes to alternate payee org (not the applicant institution)',
      wmkf_billcompaymentid: 'string — Bill.com payment reference ID',
      // Requirement fields
      akoya_requirementdue: 'datetime — report due date',
      wmkf_reporttype: 'int option set — report type (staff-facing). 682090000="Interim Report", 682090001="Final Report", 682090002="Follow-up to Final Report", 682090003="Contingency Update", 682090004="No Cost Extension", 682090005="Budget Reallocation", 682090006="Returned Postcard" (legacy: signed award letter), 682090007="Deferral Update"',
      // Shared fields
      statecode: 'int — record state',
      statuscode: 'int — status reason',
      createdon: 'datetime — record creation date',
      _akoya_requestlookup_value: 'lookup → akoya_request — parent request',
      _akoya_requestapplicant_value: 'lookup → account — applicant organization',
      _akoya_requestcontact_value: 'lookup → contact — contact person',
      _akoya_payee_value: 'lookup → account — payee organization',
    },
    rules: [
      'Use akoya_type eq false for payments only, akoya_type eq true for reporting requirements only. These are unrelated record types.',
      'wmkf_reporttype is an integer option set. Use the codes listed above (e.g. wmkf_reporttype eq 682090000 for Interim Report). Do NOT filter as string.',
      'akoya_folio is a string field with inconsistent casing. Use contains() for safe matching (e.g. contains(akoya_folio,\'Paid\')).',
    ],
  },
  contact: {
    description: 'People — contacts associated with organizations and requests (5,000+).',
    entitySet: 'contacts',
    fields: {
      fullname: 'string — full name',
      firstname: 'string — first name',
      lastname: 'string — last name',
      salutation: 'string — title prefix (e.g. "Dr.", "Prof."). 56% populated.',
      emailaddress1: 'string — primary email',
      jobtitle: 'string — job title',
      telephone1: 'string — phone number',
      akoya_contactnum: 'string — unique contact number',
      wmkf_orcid: 'string — ORCID researcher identifier. 24% populated.',
      address1_line1: 'string — street address',
      address1_city: 'string — city',
      address1_stateorprovince: 'string — state',
      address1_country: 'string — country',
      adx_organizationname: 'string — organization name from portal registration. 44% populated.',
      statecode: 'int — record state',
      contactid: 'guid — primary key',
      createdon: 'datetime — record creation date',
    },
    rules: [],
  },
  account: {
    description: 'Organizations — universities, institutions, companies (4,500+).',
    entitySet: 'accounts',
    fields: {
      name: 'string — organization name (may be legal name or common name)',
      akoya_aka: 'string — common/short name (e.g. "Stanford University" when name is the legal entity). 95% populated.',
      wmkf_legalname: 'string — official legal/incorporated name. 83% populated.',
      wmkf_dc_aka: 'string — abbreviations and alternate names (e.g. "MRN", "MGH"). 21% populated.',
      wmkf_formerlyknownas: 'string — historical names after rebranding. Sparse.',
      akoya_constituentnum: 'string — unique organization ID',
      // Grant summary stats
      akoya_totalgrants: 'currency — total grant amount',
      akoya_countofawards: 'int — number of awards',
      akoya_countofrequests: 'int — number of requests',
      wmkf_countofprogramgrants: 'int — program grant count',
      wmkf_countofconcepts: 'int — concept count',
      wmkf_countofdiscretionarygrant: 'int — discretionary grant count',
      wmkf_sumofprogramgrants: 'currency — sum of program grants',
      wmkf_sumofdiscretionarygrants: 'currency — sum of discretionary grants',
      // Tax & compliance (populated by GOverify system)
      akoya_taxid: 'string — EIN / Tax ID (e.g. "36-4760242"). 69% populated.',
      akoya_taxstatus: 'string — verification status (e.g. "Verified Nonprofit"). 57% populated.',
      wmkf_bmf509: 'string — IRS 509(a) status (e.g. "509(a)(1)", "509(a)(2)")',
      wmkf_bmfsubsectiondescription: 'string — IRS subsection (e.g. "501(c)(3) Charitable Organization")',
      wmkf_bmffoundationcode: 'string — IRS foundation status code',
      // Pub78 / IRS registered info (~57% populated)
      akoya_pub78city: 'string — IRS Publication 78 registered city',
      akoya_pub78state: 'string — IRS Publication 78 registered state',
      akoya_pub78street1: 'string — IRS Publication 78 registered address',
      akoya_pub78zip: 'string — IRS Publication 78 registered zip code',
      // GuideStar data (~57% populated)
      akoya_guidestarorganizationname: 'string — name as registered on GuideStar',
      akoya_guidestarcode: 'string — GuideStar code (e.g. "PC" = public charity)',
      akoya_guidestardescription: 'string — GuideStar full description',
      // Classification & address
      wmkf_eastwest: 'string — geographic region: east/west US',
      akoya_institutiontype: 'string — institution type',
      wmkf_financialstatementsneeded: 'boolean — needs financial statements',
      address1_line1: 'string — street address',
      address1_city: 'string — city',
      address1_stateorprovince: 'string — state',
      address1_postalcode: 'string — zip code',
      address1_country: 'string — country',
      websiteurl: 'string — website',
      telephone1: 'string — phone number',
      // Lookups
      _primarycontactid_value: 'lookup → contact — primary contact for the organization. 68% populated.',
      _wmkf_organizationleader_value: 'lookup → contact — organization leader (CEO/president). 28% populated.',
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
      attachmentcount: 'int — number of email attachments',
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
    description: 'Broad grant program categories (11 values): Research, Southern California, Undergraduate Education, Discretionary, Law, Young Scholars, Strategic Fund, Honorarium, Emeritus, Memorial, Other. Parent of akoya_program (internal programs).',
    entitySet: 'wmkf_grantprograms',
    fields: {
      wmkf_name: 'string — program name',
      wmkf_code: 'string — program code (RES, SOCAL, UE, DISC, LAW, YS, STRAT, HON, EMER, MEM, MISC)',
      _wmkf_parenttype_value: 'lookup → wmkf_type — parent type (many-to-many in practice; only Discretionary→Discretionary, Emeritus/Memorial/Other→Miscellaneous are linked)',
      wmkf_grantprogramid: 'guid — primary key',
    },
    rules: [],
  },
  wmkf_type: {
    description: 'Request type classification (8 values): Program, Discretionary, Site Visit, Office Visit, Special Projects, Special Grants, Miscellaneous, Individual. Many-to-many with grant program in practice.',
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
    description: 'Internal program definitions (24 values). Child of wmkf_grantprogram. Examples: S&E and MR under Research; Health Care, Civic & Community under Southern California; Chair\'s Grants, Employee Matching under Discretionary. Some newer programs (Disaster Relief, Bridge Funding, Research Reviewer) lack parent links.',
    entitySet: 'akoya_programs',
    fields: {
      akoya_program: 'string — program name (e.g. "Science and Engineering Research", "Bridge Funding")',
      wmkf_code: 'string — program code (SE, MR, HC, CC, EC, EP, AC, LA, UG, CGP, DDGP, DMGP, EMGP, SDGP, SSDGP, SF, EGP, MGP, LW, DR, BR, RR, MS)',
      wmkf_alternatename: 'string — alternate name',
      _wmkf_parentgrantprogram_value: 'lookup → wmkf_grantprogram — parent broad program (e.g. S&E→Research, Health Care→Southern California). Not always set for newer programs.',
      wmkf_typeofdiscretionarygrant: 'int option set — discretionary sub-type: 707510000="Director", 707510001="Staff Member", 707510002="Co-Chair". Only applies to Discretionary programs.',
      akoya_programid: 'guid — primary key. Use this GUID to filter requests: _akoya_programid_value eq {guid}',
    },
    rules: [
      'To find requests by program name: 1) query akoya_programs with contains(akoya_program,\'name\') to get the GUID, 2) query akoya_requests with _akoya_programid_value eq {guid}.',
      'Program hierarchy: wmkf_grantprogram (broad: Research, Southern California) → akoya_program (specific: S&E, MR, Health Care, etc.)',
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
const INLINE_SCHEMA_TABLES = ['akoya_request', 'account', 'contact', 'akoya_requestpayment', 'wmkf_grantprogram'];

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
- VOCABULARY FIRST: When the user's query matches a term in the VOCABULARY section (especially program names with hardcoded GUIDs), use those mappings directly — do NOT query lookup tables to re-derive GUIDs you already have. Only fall back to querying the lookup table if the hardcoded GUID returns no results or the user asks about a program not listed in VOCABULARY.
- Lookup tables (like akoya_program, wmkf_grantprogram): to filter requests by program name, first query the lookup table to get the GUID, then filter requests by the _value lookup field. Example: "Bridge Funding" → query akoya_programs for GUID → filter akoya_requests by _akoya_programid_value eq {guid}.

VOCABULARY — staff terms → correct fields:
Record types:
- The akoya_request table holds ALL record types: grant applications (16K), concepts (3K), office visits (2.8K), site visits (1.5K), phone calls (914), individual grants (86).
- DEFAULT: Always filter wmkf_request_type eq 100000001 (Request) unless user asks about concepts, visits, phone calls, or "all records".
- "concept"/"concept paper" → wmkf_request_type eq 100000000
- "site visit" → wmkf_request_type eq 100000003 (or filter by akoya_requeststatus)
- "office visit" → wmkf_request_type eq 100000002
Status:
- "status" → akoya_requeststatus (meta status: "Phase II Pending", "Active", "Closed", etc.)
- "Phase I status/outcome" → wmkf_phaseistatus (Invited, Not Invited, Ineligible, Request Withdrawn, Rescinded Grant, Incomplete, Pending Committee Review)
- "Phase II status/outcome" → wmkf_phaseiistatus (Approved, Phase II Declined, Phase II Pending Committee Review, Phase II Withdrawn, Phase II Deferred)
- "concept status" (Research) → wmkf_researchconceptstatus (Completed, Scheduled, Denied, Ineligible, Pending, Incomplete)
- "concept status" (SoCal) → wmkf_socalconceptstatus (Completed, Phone Call, Unlikely to be Competitive, Competitive Apply, Scheduled Call, Ineligible, Fit but Wait, Pending)
- "contingency"/"contingent" → wmkf_contingencystatus on request (Not Met, Met, Paid)
- Lifecycle: Concept → Phase I → Phase II → Active → Closed. akoya_requeststatus = pipeline position; phase statuses = detailed outcomes per stage.
Programs:
- "program" usually means S&E, MR, or SoCal
- "S&E"/"SE"/"science and engineering" → _akoya_programid_value eq '8dcab30b-958f-ee11-8179-000d3a341e8f'
- "MR"/"medical research" → _akoya_programid_value eq '94cab30b-958f-ee11-8179-000d3a341e8f'
- "SoCal"/"Southern California" → _wmkf_grantprogram_value eq '8cf9c61d-a7cb-ee11-9079-000d3a341fd9' (broad category, NOT akoya_program)
- "Research" (broad) → _wmkf_grantprogram_value eq 'c247b11a-a7cb-ee11-9078-000d3a341e8f'
- "Undergraduate Education"/"UE" → _wmkf_grantprogram_value eq '139321fd-a6cb-ee11-9078-000d3a341e8f'
- "Discretionary" → _wmkf_grantprogram_value eq '86e6422b-a7cb-ee11-9078-000d3a341e8f'
- Hierarchy: wmkf_grantprogram (broad: Research, Southern California, UE, Discretionary) → akoya_program (specific: S&E, MR, Health Care, Chair's Grants, etc.)
- For other programs, query the lookup table first to get the GUID.
People (external — at institution):
- "PI"/"researcher"/"principal investigator" → _wmkf_projectleader_value
- "liaison"/"primary contact" → _akoya_primarycontactid_value
- "VPR"/"VP for research" → _wmkf_researchleader_value
- "CEO"/"president"/"chancellor" → _wmkf_ceo_value
- "authorized official" → _wmkf_authorizedofficial_value
- "payment contact" → _wmkf_paymentcontact_value
- "co-PI" → _wmkf_copi1_value.._wmkf_copi5_value
- "org leader"/"organization leader" → _wmkf_organizationleader_value (on account)
- "primary contact" (on org) → _primarycontactid_value (on account)
People (internal — Keck staff):
- "PD"/"program director" → _wmkf_programdirector_value (systemuser)
- "PC"/"coordinator"/"program coordinator" → _wmkf_programcoordinator_value (systemuser)
- "GM"/"grants manager" → Keck staff role (query systemuser)
Money:
- "the ask"/"amount requested" → akoya_request (currency field, what they want from Keck)
- "total project cost"/"total budget" → akoya_expenses (full cost including cost share)
- "award"/"grant amount"/"how much did we give" → akoya_grant
- "recommended amount" → akoya_recommendedamount (staff recommendation)
- "invited amount" → wmkf_invitedamount (Phase II invited amount)
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
Payments & requirements:
- akoya_requestpayment table holds BOTH payments and reporting requirements (unrelated record types in same table)
- "payment" → akoya_type eq false. Status in akoya_folio: Paid, Scheduled, Contingent, Void, Refund, Ready To Pay.
- "report"/"requirement" → akoya_type eq true. Type in wmkf_reporttype: Interim Report (682090000), Final Report (682090001), Follow-up to Final Report (682090002), Contingency Update (682090003), No Cost Extension (682090004), Budget Reallocation (682090005), Deferral Update (682090007).
- "report due"/"due date" → akoya_requirementdue
- "payment date" → akoya_paymentdate
- "Bill.com"/"payment ID" → wmkf_billcompaymentid
- "payee"/"alternate payee" → _akoya_payee_value (payee org, may differ from applicant). wmkf_usingpayee on request indicates alternate payee is used.
Tax & compliance (on account):
- "EIN"/"tax ID" → akoya_taxid
- "tax status"/"nonprofit status" → akoya_taxstatus (e.g. "Verified Nonprofit")
- "509(a)"/"IRS status" → wmkf_bmf509 (e.g. "509(a)(1)")
- "501(c)(3)" → wmkf_bmfsubsectiondescription
- "GuideStar" → akoya_guidestarorganizationname, akoya_guidestarcode
- "Pub78"/"IRS address" → akoya_pub78city, akoya_pub78state, akoya_pub78street1

TABLES:
akoya_request (25,000+) universal record table — grants (16K), concepts (3K), site/office visits (4.3K), phone calls (914)
akoya_requestpayment (22,500+) payments (9K) & reporting requirements (13K)
contact (5,000+) people
account (4,500+) organizations
email (5,000+) email activities
annotation (5,000+) notes/attachments
wmkf_potentialreviewers (3,184) reviewers
systemuser (215) Keck staff — linked to requests via program director/coordinator
Lookup: wmkf_grantprogram(11), wmkf_type(8), wmkf_bbstatus(88), wmkf_donors(116), wmkf_supporttype(41), wmkf_programlevel2(29), akoya_program(24), akoya_phase(62), akoya_goapplystatustracking(3,407), activitypointer(5,000+)

DOCUMENTS: Proposal documents (PDFs, concept papers, bios) are stored in SharePoint, linked to CRM requests.
- list_documents: see files attached to a specific request
- search_documents: search within document contents for keywords or phrases (e.g. "budget justification", "gene therapy"). Can scope to a library or request.
When the user asks about documents, files, attachments, or uploaded materials for a request, use list_documents. When the user wants to find which documents mention a term, use search_documents.

FIELD NAMING: "akoya_" = vendor fields. "wmkf_" = Keck Foundation custom fields.

INLINE SCHEMAS (no describe_table needed for these):
${inlineSchemas}`;
}

/**
 * Claude tool definitions — 10 tools for the search-first architecture.
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
    name: 'list_documents',
    description: 'List SharePoint documents attached to a Dynamics CRM request. Returns filenames, sizes, and dates. Use when user asks about documents, files, attachments, PDFs, or proposals for a specific request.',
    input_schema: {
      type: 'object',
      properties: {
        request_number: { type: 'string', description: 'Request number (e.g. "1001289")' },
        request_id: { type: 'string', description: 'Request GUID (alternative to request_number)' },
      },
      required: [],
    },
  },
  {
    name: 'search_documents',
    description: 'Search within SharePoint document contents (PDFs, Word docs, etc.) for keywords or phrases. Searches full text of files, not just filenames. Use quotes for exact phrase match. Can scope to a specific library or request.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or quoted phrase (e.g. "budget justification")' },
        library: { type: 'string', description: 'Library to scope search (e.g. "akoya_request"). Omit to search all.' },
        request_number: { type: 'string', description: 'Scope to a specific request folder (e.g. "1002386")' },
      },
      required: ['query'],
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
