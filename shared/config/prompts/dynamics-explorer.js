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
- Null fields are stripped from results. Use $select with fields from schema below.
- Lookup fields (_xxx_value) return GUIDs; the _formatted version has display names. Always $select both.
- Complete the task in as FEW tool calls as possible. Combine information you already have.
- When searching by org name with contains(), review ALL returned accounts and pick the exact match. E.g. contains(name,'University of Chicago') returns both "Loyola University Of Chicago" and "University of Chicago" — pick the right one.

FIELD NAMING: "akoya_" fields were created by the vendor (Akoya). "wmkf_" fields are Keck Foundation custom fields and often contain the most operationally relevant data. When searching for Keck-specific information (concepts, program types, eligibility, reviewers, etc.), prioritize wmkf_ fields.

IMPORTANT — EMAIL DATE FILTERING: The "senton" field is NULL for all incoming emails. Only outgoing emails have senton populated. Always filter emails by "createdon" (not senton) for date ranges to capture both incoming and outgoing correspondence.

CROSS-TABLE LOOKUPS:
- Requests by org: query account for accountid → filter akoya_request by _akoya_applicantid_value eq GUID
- Requests by person: query contact for contactid → filter by _akoya_primarycontactid_value eq GUID
- Payments for request: filter akoya_requestpayment by _akoya_requestlookup_value eq request-GUID
- Concepts for request: filter akoya_concept by _akoya_request_value eq request-GUID
- Notes/attachments on record: filter annotation by _objectid_value eq record-GUID
- Grant program name: lookup wmkf_grantprogram by _wmkf_grantprogram_value from request
- Request type name: lookup wmkf_type by _wmkf_type_value from request
- Emails for org: emails are linked to REQUESTS, NOT accounts. Get the org's request IDs first, then filter email by _regardingobjectid_value eq request-GUID. Use createdon (not senton) for date filtering. Also search contains(subject,'OrgName') for additional matches.

OData: eq, ne, contains(field,'text'), gt, lt, ge, le, and, or, not. Dates: 2024-01-01T00:00:00Z.
Present results as markdown tables.

SCHEMA (table_name → entitySet — description):

akoya_request → akoya_requests — proposals/grants (5000+)
  akoya_requestnum, akoya_requeststatus, akoya_requesttype, akoya_submitdate, akoya_fiscalyear, akoya_paid, akoya_loireceived, createdon, modifiedon, statecode, statuscode, _akoya_applicantid_value, _akoya_primarycontactid_value, _wmkf_programdirector_value, _wmkf_programcoordinator_value, _wmkf_grantprogram_value, _wmkf_type_value, wmkf_request_type, wmkf_typeforrollup, wmkf_meetingdate, wmkf_numberofyearsoffunding, wmkf_numberofconcepts, wmkf_numberofpayments, wmkf_mrconcept1title, wmkf_mrconcept2title, wmkf_mrconcept3title, wmkf_mrconcept4title, wmkf_seconcept1title, wmkf_seconcept2title, wmkf_seconcept3title, wmkf_seconcept4title, wmkf_researchconceptstatus, wmkf_conceptcalldate, wmkf_researchconceptemailsent, wmkf_vendorverified, wmkf_phaseiicheckincomplete, wmkf_pcgoverifycomplete, wmkf_calculatedtime

akoya_concept → akoya_concepts — research concepts / eligibility screening (75)
  akoya_title, akoya_conceptid, wmkf_conceptnumber, wmkf_conceptstatus, wmkf_concepttype, wmkf_meetingdate, wmkf_readyforreview, wmkf_reviewcompleted, wmkf_datenotified, wmkf_staffoutcome, wmkf_competitiveconcepttitle, wmkf_conceptpapernotes, wmkf_socalprogramorcapital, wmkf_orgleadbyinterimortransition, wmkf_requestforaoneyeargrant, wmkf_organizationqualified501c3, wmkf_organizationpublicchartity, wmkf_stafflocatedinla, wmkf_headquartersincalifornia, wmkf_atleast2yearsauditedfinancials, wmkf_requestforunrestrictedfunding, wmkf_annualoperatingbudgetatleast750000, wmkf_projectserveresidentsoflacounty, wmkf_receivedgrantfromfoundation, wmkf_organizationgovernmentunit, wmkf_ifcapitalrequestdoyouhavesitecontrol, wmkf_projecttitle2, wmkf_projecttitle3, createdon, modifiedon, _akoya_applicant_value, _akoya_request_value, _akoya_primarycontact_value, _wmkf_internalprogram_value

akoya_requestpayment → akoya_requestpayments — payments (5000+)
  akoya_paymentnum, akoya_type, akoya_amount, akoya_netamount, akoya_paymentdate, akoya_postingdate, akoya_estimatedgrantpaydate, akoya_requirementdue, akoya_requirementtype, akoya_folio, wmkf_reporttype, wmkf_billcompaymentid, createdon, modifiedon, statecode, statuscode, _akoya_requestlookup_value, _akoya_requestapplicant_value, _akoya_requestcontact_value, _akoya_payee_value

contact → contacts — people (5000+)
  fullname, firstname, lastname, salutation, emailaddress1, jobtitle, telephone1, akoya_contactnum, createdon, modifiedon, statecode, statuscode, contactid

account → accounts — organizations (4500+)
  name, akoya_constituentnum, akoya_totalgrants, akoya_countofawards, akoya_countofrequests, wmkf_countofprogramgrants, wmkf_countofconcepts, wmkf_countofdiscretionarygrant, wmkf_sumofprogramgrants, wmkf_sumofdiscretionarygrants, wmkf_eastwest, wmkf_financialstatementsneeded, wmkf_bmf509, wmkf_bmfsubsectiondescription, wmkf_bmffoundationcode, address1_line1, address1_city, address1_stateorprovince, address1_postalcode, address1_country, websiteurl, telephone1, akoya_taxid, akoya_institutiontype, createdon, modifiedon, statecode, accountid

email → emails — email activities (5000+)
  subject, description, sender, torecipients, senton, directioncode, attachmentcount, createdon, modifiedon, statecode, statuscode, activityid, _regardingobjectid_value

annotation → annotations — notes/attachments (5000+)
  subject, notetext, filename, mimetype, filesize, isdocument, createdon, modifiedon, annotationid, _objectid_value

wmkf_potentialreviewers → wmkf_potentialreviewerses — potential reviewers (3141)
  wmkf_name, wmkf_firstname, wmkf_lastname, wmkf_prefix, wmkf_title, wmkf_emailaddress, wmkf_organizationname, wmkf_areaofexpertise, wmkf_source, wmkf_potentialreviewersid

wmkf_donors → wmkf_donorses — donors (116)
  wmkf_name, wmkf_code, wmkf_dc_id, wmkf_donorsid

wmkf_bbstatus → wmkf_bbstatuses — board/grant status codes (88)
  wmkf_name, wmkf_bbcode, wmkf_bbid, wmkf_requesttype, wmkf_bbstatusid

akoya_program → akoya_programs — grant programs (24)
  akoya_program, wmkf_code, wmkf_alternatename, wmkf_typeofdiscretionarygrant, akoya_programid

wmkf_supporttype → wmkf_supporttypes — support types (41)
  wmkf_name, wmkf_supporttypeid

wmkf_programlevel2 → wmkf_programlevel2s — program categories (29)
  wmkf_name, wmkf_programlevel2id

wmkf_grantprogram → wmkf_grantprograms — grant program lookup (11)
  wmkf_name, wmkf_code, wmkf_grantprogramid

wmkf_type → wmkf_types — request type lookup (8)
  wmkf_name, wmkf_typeid

akoya_phase → akoya_phases — application phases (62)
  akoya_phasename, akoya_phase, akoya_phaseorder, akoya_phasetype, akoya_totalsubmissions, akoya_totalawarded, akoya_totalrequested, _akoya_application_value

akoya_goapplystatustracking → akoya_goapplystatustrackings — application tracking (3293)
  akoya_id, akoya_applicantemail, akoya_currentphasestatus, akoya_duedate, akoya_progress, akoya_mostrecentsubmitdate, _akoya_request_value, _akoya_goapplyapplication_value, _akoya_goapplyapplicant_value

activitypointer → activitypointers — all activities (5000+)
  subject, description, activitytypecode, actualend, createdon, modifiedon, statecode, statuscode, activityid, _regardingobjectid_value`;
}

/**
 * Claude tool definitions — minimal set for low token overhead.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'query_records',
    description: 'Query records. Null fields stripped. Use $select from schema above.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        select: { type: 'string', description: 'Comma-separated fields' },
        filter: { type: 'string', description: 'OData $filter' },
        orderby: { type: 'string', description: 'OData $orderby' },
        top: { type: 'integer', description: '1-100, default 10' },
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
