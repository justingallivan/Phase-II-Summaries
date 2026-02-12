# Dynamics Explorer — Schema Annotation Plan

## Goal

Add human-readable annotations to the field names in the Dynamics Explorer system prompt (`shared/config/prompts/dynamics-explorer.js`). This helps Claude (especially Haiku 4.5) correctly map natural-language questions to the right fields.

## Why This Matters

Many CRM field names are cryptic:
- `akoya_loireceived` — What does LOI stand for? (Letter of Inquiry)
- `wmkf_typeforrollup` — What does this roll up? How is it different from `wmkf_request_type`?
- `wmkf_phaseiicheckincomplete` — Is this "check-in complete" or "check incomplete"?
- `wmkf_vendorverified` — What vendor? What's being verified?
- `wmkf_bmf509` — What is BMF 509?
- `wmkf_eastwest` — East/west of what?
- `akoya_folio` — What is a folio in this context?
- `wmkf_socalprogramorcapital` — What does this flag mean?

Without annotations, Claude either guesses wrong or skips relevant fields entirely.

## Format

Add brief parenthetical hints after ambiguous fields. Keep annotations short (2-6 words) to minimize token overhead. Only annotate fields where the name isn't self-explanatory.

**Before:**
```
akoya_loireceived, wmkf_vendorverified, wmkf_phaseiicheckincomplete
```

**After:**
```
akoya_loireceived (Letter of Inquiry date), wmkf_vendorverified (background check done), wmkf_phaseiicheckincomplete (Phase II check-in complete)
```

## Tables to Annotate

Work through each table below. For each field, the domain expert should provide a brief description if the field name is not self-explanatory. Fields marked with `?` are the ones most in need of clarification.

### 1. akoya_request (proposals/grants) — PRIMARY TABLE

Current fields:
- `akoya_requestnum` — request number (clear)
- `akoya_requeststatus` — status (clear)
- `akoya_requesttype` — type (clear)
- `akoya_submitdate` — submission date (clear)
- `akoya_fiscalyear` — fiscal year label, e.g. "June 2025" (documented)
- `akoya_paid` — ? total amount paid?
- `akoya_loireceived` — ? Letter of Inquiry received date?
- `statecode` — active/inactive (standard Dynamics)
- `statuscode` — detailed status (standard Dynamics)
- `createdon` / `modifiedon` — timestamps (clear)
- `_akoya_applicantid_value` — linked account/org (clear)
- `_akoya_primarycontactid_value` — linked contact person (clear)
- `_wmkf_programdirector_value` — ? Keck staff program director?
- `_wmkf_programcoordinator_value` — ? Keck staff program coordinator?
- `_wmkf_grantprogram_value` — grant program lookup (clear)
- `_wmkf_type_value` — request type lookup (clear)
- `wmkf_request_type` — ? how does this differ from akoya_requesttype and _wmkf_type_value?
- `wmkf_typeforrollup` — ? what does this roll up? reporting category?
- `wmkf_meetingdate` — ? board meeting date for decision?
- `wmkf_numberofyearsoffunding` — years of funding (clear)
- `wmkf_numberofconcepts` — concept count (clear)
- `wmkf_numberofpayments` — payment count (clear)
- `wmkf_mrconcept1title..4title` — ? MR = Medical Research? concept titles
- `wmkf_seconcept1title..4title` — ? SE = Science & Engineering? concept titles
- `wmkf_researchconceptstatus` — ? status of research concept review?
- `wmkf_conceptcalldate` — ? date concepts were called/requested?
- `wmkf_researchconceptemailsent` — ? has the concept email been sent?
- `wmkf_vendorverified` — ? Akoya vendor verification? background check?
- `wmkf_phaseiicheckincomplete` — ? Phase II check-in is complete? or check is incomplete?
- `_wmkf_potentialreviewer1_value` .. `5` — reviewer lookups (documented)
- `wmkf_excludedreviewers` — excluded reviewers with reasons (documented)

### 2. akoya_concept (concepts/eligibility)

- `akoya_title` — concept title (clear)
- `wmkf_conceptnumber` — concept number (clear)
- `wmkf_conceptstatus` — status (clear)
- `wmkf_concepttype` — ? type of concept (research, SoCal, etc.)?
- `wmkf_meetingdate` — ? review meeting date?
- `wmkf_readyforreview` — ready for review flag (clear)
- `wmkf_reviewcompleted` — review completed flag (clear)
- `wmkf_datenotified` — ? date applicant was notified of outcome?
- `wmkf_staffoutcome` — ? staff recommendation/decision?
- `wmkf_competitiveconcepttitle` — ? title if it became competitive?
- `wmkf_conceptpapernotes` — ? notes on the concept paper?
- `wmkf_socalprogramorcapital` — ? SoCal Program vs Capital grant flag?
- `wmkf_projecttitle2` / `wmkf_projecttitle3` — ? alternate project titles?
- Eligibility flags — all are self-explanatory boolean fields

### 3. akoya_requestpayment (payments)

- `akoya_paymentnum` — payment number (clear)
- `akoya_type` — ? payment type (e.g., scheduled, final)?
- `akoya_amount` / `akoya_netamount` — amounts (clear)
- `akoya_paymentdate` / `akoya_postingdate` — dates (clear)
- `akoya_estimatedgrantpaydate` — estimated payment date (clear)
- `akoya_requirementdue` — ? report/requirement due date?
- `akoya_requirementtype` — ? type of requirement (progress report, financial report)?
- `akoya_folio` — ? what is a folio?
- `wmkf_reporttype` — ? type of report associated with payment?

### 4. account (organizations)

- `akoya_constituentnum` — ? constituent number?
- `akoya_totalgrants` — total grant dollars (clear)
- `akoya_countofawards` / `akoya_countofrequests` — counts (clear)
- `wmkf_countofprogramgrants` / `wmkf_countofconcepts` / `wmkf_countofdiscretionarygrant` — counts by type (clear)
- `wmkf_sumofprogramgrants` / `wmkf_sumofdiscretionarygrants` — dollar sums (clear)
- `wmkf_eastwest` — ? east/west of what? geographic classification?
- `wmkf_financialstatementsneeded` — ? flag for needing financial statements?
- `wmkf_bmf509` — ? BMF = Business Master File? IRS 509(a) status?
- `wmkf_bmfsubsectiondescription` — ? IRS subsection description?
- `akoya_institutiontype` — institution type (clear)

### 5. Other tables

- `email` — all fields are clear
- `annotation` — all fields are clear
- `wmkf_potentialreviewers` — all fields are clear
- `contact` — all fields are clear
- Lookup tables — all fields are clear

## Process

1. Go through each `?` field above with the domain expert
2. Replace `?` with the actual meaning
3. Update the schema in `shared/config/prompts/dynamics-explorer.js` with concise annotations
4. Test with queries that would exercise the annotated fields
5. Also consider: are there important fields NOT currently in the schema that users would want to query?

## File to Edit

`shared/config/prompts/dynamics-explorer.js` — the `buildSystemPrompt()` function, lines 49-87 (SCHEMA section)

## Token Budget

Current system prompt is ~2,800 tokens. Adding annotations will increase this. Budget ~200 extra tokens for annotations (roughly 50-60 short parenthetical hints). If we exceed that, consider dropping rarely-queried fields from the schema instead.
