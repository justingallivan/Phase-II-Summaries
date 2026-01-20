# Session 34 Prompt: Fix Multi-Proposal Email Generation Bug

## Priority: HIGH

## Bug Description

When generating reviewer invitation emails across multiple proposals in the Reviewer Finder, only the first proposal's information is used for all emails.

**Current Behavior:**
- User selects candidates from multiple proposals in "My Candidates" tab
- User clicks "Email Selected" to generate invitation emails
- All generated emails contain the same proposal title and summary attachment (from the first proposal)

**Expected Behavior:**
- Each email should include the correct proposal title for the candidate's associated proposal
- Each email should attach the correct summary PDF for that specific proposal
- The `{{proposalTitle}}`, `{{piName}}`, `{{piInstitution}}`, and other proposal placeholders should reflect each candidate's actual proposal

## Impact

This bug makes batch email generation across multiple proposals unusable. Users must generate emails one proposal at a time as a workaround.

## Likely Location of Bug

The issue is likely in one of these files:

1. **`pages/api/reviewer-finder/generate-emails.js`** - The API endpoint that generates .eml files
   - May be using a single `proposalInfo` object for all candidates instead of looking up each candidate's proposal

2. **`shared/components/EmailGeneratorModal.js`** - The modal that calls the API
   - May be passing only one proposal's info to the API instead of per-candidate proposal info

3. **`pages/reviewer-finder.js`** - The main page
   - May be collecting `proposalInfo` incorrectly when multiple proposals are involved

## Key Data Flow

1. Candidates are saved to `reviewer_suggestions` table with `proposal_search_id` linking them to their proposal
2. Each `proposal_search` has its own `title`, `pi_name`, `pi_institution`, and `summary_blob_url`
3. When generating emails, the system should look up each candidate's proposal info via their `proposal_search_id`

## Investigation Steps

1. Check how `proposalInfo` is passed from `reviewer-finder.js` → `EmailGeneratorModal` → `generate-emails` API
2. Verify if the API receives per-candidate proposal info or just a single proposal
3. Check if `reviewer_suggestions` records have correct `proposal_search_id` values
4. Trace how the email template placeholders (`{{proposalTitle}}`, etc.) are populated

## Database Schema Reference

```sql
-- Candidates are linked to proposals via proposal_search_id
reviewer_suggestions (
  id,
  proposal_search_id,  -- FK to proposal_searches
  researcher_id,
  name, email, affiliation, ...
)

-- Each proposal search has its own metadata
proposal_searches (
  id,
  title,
  pi_name,
  pi_institution,
  summary_blob_url,  -- The extracted summary PDF
  ...
)
```

## Testing

After fixing:
1. Upload 2+ different proposals and save candidates for each
2. Select candidates from different proposals in "My Candidates"
3. Click "Email Selected" and generate emails
4. Verify each .eml file has the correct proposal title in subject/body
5. Verify each .eml file has the correct summary PDF attached

## Session 33 Context

Session 33 migrated Reviewer Finder settings to per-user database storage. The email generation code in `EmailGeneratorModal.js` was modified to load settings from profile preferences, but the core email generation logic was not changed.
