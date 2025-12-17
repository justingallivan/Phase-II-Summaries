# Tier 4: SerpAPI Google Search - Implementation Plan

## Overview

Add a fourth tier to the contact enrichment system using SerpAPI's Google Search API. This provides a fallback when PubMed, ORCID, and Claude Web Search fail to find contact information.

## Why Tier 4?

Currently, Claude Web Search (Tier 3) doesn't always find contact info because:
1. Claude's web search has limited reach compared to Google
2. Some faculty pages may not be well-indexed by Claude's search
3. Claude may not find the right page structure to extract email

SerpAPI Google Search offers:
- Full Google search coverage
- Structured results with snippets
- Direct parsing of search results for email patterns
- Already integrated in codebase via `scholar-service.js`
- Uses existing `SERP_API_KEY` environment variable

## Implementation Plan

### 1. Create SerpAPI Contact Search Function

**File:** `lib/services/serp-contact-service.js` (NEW)

```javascript
class SerpContactService {
  static async findContact(candidate) {
    // Search query: "FirstName LastName" + institution + "email"
    // Parse results for:
    //   - Email patterns in snippets
    //   - Faculty page URLs
    //   - Personal website URLs
    // Return: { email, facultyPageUrl, website }
  }
}
```

**Search Strategy:**
1. Primary query: `"FirstName LastName" institution email`
2. Fallback query: `"FirstName LastName" institution faculty`
3. Parse snippet text for email patterns: `/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/`
4. Extract useful URLs from results (filter generic directories)

### 2. Update ContactEnrichmentService

**File:** `lib/services/contact-enrichment-service.js`

Add after Tier 3 (Claude Web Search):

```javascript
// ============================================
// TIER 4: SerpAPI Google Search (PAID)
// ============================================
if (useSerpSearch && credentials.serpApiKey) {
  // Only run if we still don't have email
  if (!result.contactEnrichment.email) {
    const serpResult = await SerpContactService.findContact(candidate);
    // Apply results...
  }
}
```

**Cost estimate:** ~$0.005 per search (based on SerpAPI pricing: $50/5000 searches)

### 3. Update Cost Constants

```javascript
const COSTS = {
  PUBMED: 0,
  ORCID: 0,
  CLAUDE_WEB_SEARCH: 0.015,
  SERP_GOOGLE_SEARCH: 0.005,  // NEW
};
```

### 4. Update Frontend (reviewer-finder.js)

**State changes:**
```javascript
const [enrichmentOptions, setEnrichmentOptions] = useState({
  usePubmed: true,
  useOrcid: true,
  useClaudeSearch: false,
  useSerpSearch: false,  // NEW
});
```

**UI checkbox (after Tier 3):**
```jsx
<label className={`flex items-start gap-3 p-3 rounded-lg ${
  hasSerpApiKey
    ? 'bg-blue-50 border border-blue-200 cursor-pointer'
    : 'bg-gray-50 border border-gray-200 cursor-not-allowed opacity-60'
}`}>
  <input
    type="checkbox"
    checked={enrichmentOptions.useSerpSearch && hasSerpApiKey}
    onChange={(e) => setEnrichmentOptions(prev => ({ ...prev, useSerpSearch: e.target.checked }))}
    disabled={!hasSerpApiKey}
  />
  <div>
    <div className="font-medium text-blue-800">Tier 4: Google Search (SerpAPI)</div>
    <div className="text-xs text-blue-600">
      Search Google for faculty pages and emails. <strong>~$0.005 per candidate</strong>
    </div>
  </div>
</label>
```

### 5. Update API Endpoint

**File:** `pages/api/reviewer-finder/enrich-contacts.js`

Pass `serpApiKey` from environment to service:
```javascript
const results = await ContactEnrichmentService.enrichCandidates(candidates, {
  credentials: {
    ...credentials,
    serpApiKey: process.env.SERP_API_KEY,
  },
  useSerpSearch: options.useSerpSearch,
  // ...
});
```

### 6. Update Stats Tracking

Add `serp_search` to stats tracking:
```javascript
stats: {
  bySource: {
    database: 0,
    pubmed: 0,
    orcid: 0,
    claude_search: 0,
    serp_search: 0,  // NEW
  },
}
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `lib/services/serp-contact-service.js` | NEW | Google search for contact info |
| `lib/services/contact-enrichment-service.js` | MODIFY | Add Tier 4 logic, update costs |
| `pages/reviewer-finder.js` | MODIFY | Add checkbox, update state |
| `pages/api/reviewer-finder/enrich-contacts.js` | MODIFY | Pass serpApiKey to service |

## Search Query Examples

For candidate "Jane Smith" at "Stanford University":

1. **Primary:** `"Jane Smith" Stanford University email`
2. **Fallback:** `"Jane Smith" Stanford faculty`

## Email Extraction Logic

From search result snippets:
```javascript
function extractEmailFromSnippet(snippet) {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const matches = snippet.match(emailPattern);

  // Filter out generic emails
  const validEmails = matches?.filter(email => {
    const lowerEmail = email.toLowerCase();
    return !lowerEmail.includes('example') &&
           !lowerEmail.includes('info@') &&
           !lowerEmail.includes('contact@') &&
           !lowerEmail.includes('support@');
  });

  return validEmails?.[0] || null;
}
```

## URL Filtering

Reuse existing `isUsefulWebsiteUrl()` function to filter out:
- Generic directory pages (/people/, /directory/)
- Search result pages
- Non-personal pages

## Testing Checklist

- [ ] SerpAPI key detection (show/hide tier 4 option)
- [ ] Search query formation with candidate name + institution
- [ ] Email extraction from snippets
- [ ] Faculty page URL extraction
- [ ] Generic URL filtering
- [ ] Cost tracking in stats
- [ ] Results display in enrichment modal
- [ ] Results saved to candidate cards

## Notes

- SerpAPI is already used in `scholar-service.js` for author profiles
- Reuses `SERP_API_KEY` environment variable
- Lower cost than Claude Web Search ($0.005 vs $0.015)
- Could potentially replace Claude Web Search entirely if more effective
