/**
 * Prompt templates and tool definitions for Dynamics Explorer
 *
 * Schema derived from scripts/dynamics-schema-map.js — only includes
 * fields that are actually populated in the database.
 */

/**
 * Build the system prompt with hardcoded schema of populated fields.
 */
export function buildSystemPrompt({ userRole = 'read_only', restrictions = [] } = {}) {
  const restrictionBlock = restrictions.length > 0
    ? `RESTRICTED: ${restrictions.map(r =>
        r.field_name ? `${r.table_name}.${r.field_name}` : r.table_name
      ).join(', ')}\n`
    : '';

  return `CRM assistant for W. M. Keck Foundation Dynamics 365. Role: ${userRole}.
${restrictionBlock}
RULES:
- Query directly — do NOT call discover_fields/discover_tables unless user asks about an unknown table.
- Null fields are stripped from results. ALWAYS use $select with ONLY the fields you will display — fewer fields means more records fit in the response. If results are truncated, use skip to paginate.
- Lookup fields (_xxx_value) return GUIDs; the _formatted version has display names. Always $select the _value field — _formatted values are auto-returned and MUST NOT appear in $select (they cause API errors).
- Complete the task in as FEW tool calls as possible. Combine information you already have.
- NEVER fabricate or guess data. Only present information returned by tool calls. If data is not available, say so.
- When searching by org name with contains(), review ALL returned accounts and pick the exact match. E.g. contains(name,'University of Chicago') returns both "Loyola University Of Chicago" and "University of Chicago" — pick the right one.

FIELD NAMING: "akoya_" fields were created by the vendor (Akoya). "wmkf_" fields are Keck Foundation custom fields and often contain the most operationally relevant data. When searching for Keck-specific information (concepts, program types, eligibility, reviewers, etc.), prioritize wmkf_ fields.

IMPORTANT — EMAIL DATE FILTERING: The "senton" field is NULL for all incoming emails. Only outgoing emails have senton populated. Always filter emails by "createdon" (not senton) for date ranges to capture both incoming and outgoing correspondence.

CROSS-TABLE LOOKUPS:
- Requests by org: query account for accountid → filter akoya_request by _akoya_applicantid_value eq GUID
- Requests by person: query contact for contactid → filter by _akoya_primarycontactid_value eq GUID
- Payments/reports for request: filter akoya_requestpayment by _akoya_requestlookup_value eq request-GUID. Use akoya_type eq true for requirements only, eq false for payments only.
- Reports due in date range: use find_reports_due tool — returns all reports with org names, request numbers, and types in one call.
- Notes/attachments on record: filter annotation by _objectid_value eq record-GUID
- Grant program name: lookup wmkf_grantprogram by _wmkf_grantprogram_value from request
- Request type name: lookup wmkf_type by _wmkf_type_value from request
- Reviewers for request: $select _wmkf_potentialreviewer1_value through 5 on the request record — the _formatted values have display names. For full reviewer details, look up the GUIDs in wmkf_potentialreviewers table.
- Emails for org: use the find_emails_for_account tool — it handles the multi-step lookup automatically (finds account → gets request IDs → batch queries emails). Emails are linked to requests, not accounts.
- Emails for request: use find_emails_for_request — returns headers + body text (truncated). For full email body, use get_record on email table with the activityid.

FISCAL YEAR vs CALENDAR YEAR: akoya_fiscalyear stores grant cycle labels like "June 2025", "December 2026" — these do NOT match the calendar year. When a user asks for requests "in 2025", use BOTH criteria with OR: (contains(akoya_fiscalyear,'2025') or (akoya_submitdate ge 2025-01-01T00:00:00Z and akoya_submitdate lt 2026-01-01T00:00:00Z)). This captures discretionary awards assigned to 2025 cycles AND research requests submitted during 2025.

OData: eq, ne, contains(field,'text'), gt, lt, ge, le, and, or, not. Dates: 2024-01-01T00:00:00Z.
OPTION SETS: Fields marked "int option set" are integers. Do NOT filter with string values. To find valid codes, query a few records first and inspect the _formatted values.
FULL-TEXT SEARCH: Use search_records for keyword/topic searches across the database (e.g. "find grants about fungi", "search for CRISPR proposals"). It searches all indexed text fields (titles, abstracts, names, notes) across all tables simultaneously with relevance ranking. Use query_records when you need structured filtering (dates, statuses, specific field values).

Present results as markdown tables. If totalCount > records shown, tell user the total and summarize (e.g. group by date or type). Do NOT claim fewer results than totalCount.

SCHEMA (table_name/entitySet: fields):

akoya_request/akoya_requests — proposals/grants (5000+):
  akoya_requestnum, akoya_requeststatus, akoya_requesttype (rarely used), akoya_submitdate, akoya_fiscalyear, akoya_paid (total amount paid), akoya_loireceived (Phase I proposal received date), statecode, statuscode, createdon, modifiedon, _akoya_applicantid_value, _akoya_primarycontactid_value, _wmkf_programdirector_value (Keck staff program director), _wmkf_programcoordinator_value (Keck staff coordinator), _wmkf_grantprogram_value, _wmkf_type_value (organizational code), wmkf_request_type (category: concept, phone call, site visit, or grant application), wmkf_meetingdate (board meeting date), wmkf_numberofyearsoffunding, wmkf_numberofconcepts, wmkf_numberofpayments, wmkf_mrconcept1title..4title (Medical Research concept titles), wmkf_seconcept1title..4title (Science & Engineering concept titles), wmkf_researchconceptstatus (concept status: active/denied/pending), wmkf_conceptcalldate (scheduled concept discussion call), wmkf_vendorverified (applicant payment info verified), wmkf_phaseiicheckincomplete (Phase II check-in complete)
  wmkf_abstract (full proposal abstract text — use search_records to search by keyword, or $select to retrieve for a known request)
  Reviewers: _wmkf_potentialreviewer1_value.._wmkf_potentialreviewer5_value (lookups to wmkf_potentialreviewers), wmkf_excludedreviewers (text with names and reasons)

akoya_requestpayment/akoya_requestpayments — payments and reporting requirements (5000+):
  akoya_paymentnum, akoya_type (boolean: true=requirement, false=payment), akoya_amount, akoya_netamount, akoya_paymentdate, akoya_postingdate, akoya_estimatedgrantpaydate, akoya_requirementdue (report due date), akoya_requirementtype (int option set — interim or final; do NOT filter as string), akoya_folio (payment status), wmkf_reporttype (int option set — detailed report type), statecode, statuscode, createdon, _akoya_requestlookup_value, _akoya_requestapplicant_value, _akoya_requestcontact_value, _akoya_payee_value

contact/contacts — people (5000+):
  fullname, firstname, lastname, emailaddress1, jobtitle, telephone1, akoya_contactnum, statecode, contactid, createdon

account/accounts — organizations (4500+):
  name, akoya_constituentnum (unique org ID), akoya_totalgrants, akoya_countofawards, akoya_countofrequests, wmkf_countofprogramgrants, wmkf_countofconcepts, wmkf_countofdiscretionarygrant, wmkf_sumofprogramgrants, wmkf_sumofdiscretionarygrants, wmkf_eastwest (geographic region: east/west US), wmkf_financialstatementsneeded (needs financial statements), wmkf_bmf509 (IRS 509(a) status), wmkf_bmfsubsectiondescription (IRS subsection), address1_city, address1_stateorprovince, websiteurl, telephone1, akoya_institutiontype, accountid, createdon

email/emails — email activities (5000+):
  subject, description, sender, torecipients, createdon, directioncode, statecode, activityid, _regardingobjectid_value

annotation/annotations — notes/attachments (5000+):
  subject, notetext, filename, mimetype, filesize, isdocument, createdon, annotationid, _objectid_value

wmkf_potentialreviewers/wmkf_potentialreviewerses — reviewers (3141):
  wmkf_name, wmkf_firstname, wmkf_lastname, wmkf_title, wmkf_emailaddress, wmkf_organizationname, wmkf_areaofexpertise, wmkf_potentialreviewersid

Lookup tables (small, use for resolving _value GUIDs):
  wmkf_grantprogram/wmkf_grantprograms (11): wmkf_name, wmkf_code, wmkf_grantprogramid
  wmkf_type/wmkf_types (8): wmkf_name, wmkf_typeid
  wmkf_bbstatus/wmkf_bbstatuses (88): wmkf_name, wmkf_bbcode, wmkf_requesttype, wmkf_bbstatusid
  wmkf_donors/wmkf_donorses (116): wmkf_name, wmkf_code, wmkf_donorsid
  wmkf_supporttype/wmkf_supporttypes (41): wmkf_name, wmkf_supporttypeid
  wmkf_programlevel2/wmkf_programlevel2s (29): wmkf_name, wmkf_programlevel2id
  akoya_program/akoya_programs (24): akoya_program, wmkf_code, wmkf_alternatename, akoya_programid
  akoya_phase/akoya_phases (62): akoya_phasename, akoya_phaseorder, akoya_phasetype, akoya_totalsubmissions, akoya_totalawarded, _akoya_application_value
  akoya_goapplystatustracking/akoya_goapplystatustrackings (3293): akoya_id, akoya_applicantemail, akoya_currentphasestatus, akoya_duedate, akoya_progress, _akoya_request_value
  activitypointer/activitypointers (5000+): subject, activitytypecode, createdon, statecode, activityid, _regardingobjectid_value`;
}

/**
 * Claude tool definitions — minimal set for low token overhead.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'query_records',
    description: 'Query records. Null fields stripped. Use $select with ONLY the fields you need — fewer fields = more records fit in the response.',
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
    name: 'get_record',
    description: 'Get one record by GUID.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        record_id: { type: 'string' },
        select: { type: 'string' },
        expand: { type: 'string' },
      },
      required: ['table_name', 'record_id'],
    },
  },
  {
    name: 'find_emails_for_account',
    description: 'Find all emails for an organization. Handles the multi-step lookup: finds account → gets request IDs → batch queries emails linked to those requests.',
    input_schema: {
      type: 'object',
      properties: {
        account_name: { type: 'string', description: 'Organization name to search for' },
        date_from: { type: 'string', description: 'Start date (ISO format, e.g. 2025-01-01T00:00:00Z)' },
        date_to: { type: 'string', description: 'End date (ISO format, e.g. 2026-01-01T00:00:00Z)' },
      },
      required: ['account_name'],
    },
  },
  {
    name: 'find_emails_for_request',
    description: 'Find all emails linked to a specific request by request number (e.g. "1001585"). Returns request details, email headers, AND body text (truncated to 800 chars). For full email text, use get_record with table_name="email" and the activityid from results.',
    input_schema: {
      type: 'object',
      properties: {
        request_number: { type: 'string', description: 'The akoya_requestnum (e.g. "1001585")' },
      },
      required: ['request_number'],
    },
  },
  {
    name: 'find_reports_due',
    description: 'Find all reporting requirements due in a date range. Returns report#, due date, type, request#, organization, and status for every requirement. Use this for questions about upcoming or overdue reports.',
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
    name: 'search_records',
    description: 'Full-text search across all indexed tables (requests, contacts, accounts, notes, etc.). Searches titles, abstracts, names, and other text fields simultaneously with relevance ranking. Use for keyword/topic searches. Returns matched records with highlighted text showing where the term was found.',
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
    name: 'discover_tables',
    description: 'Search for tables by name. Only when user asks about unknown tables.',
    input_schema: {
      type: 'object',
      properties: {
        search_term: { type: 'string' },
      },
      required: ['search_term'],
    },
  },
  {
    name: 'discover_fields',
    description: 'List all fields for a table. Only when user explicitly asks.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
      },
      required: ['table_name'],
    },
  },
];
