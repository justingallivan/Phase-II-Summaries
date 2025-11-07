# Federal Funding Gap Analyzer - Integration Specification

## Integration Overview

Add the Federal Funding Gap Analyzer as the 8th application in the existing Next.js multi-app document processing system. Leverages 80% of existing shared components while adding new functionality for multi-agency API queries.

## Why This Integration Works

**Existing Infrastructure We'll Use:**
- ✅ Vercel Blob storage for PDF uploads (>4.5MB support)
- ✅ Claude API integration (claude-sonnet-4-20250514)
- ✅ Shared UI components (Layout, FileUploader, ResultsDisplay)
- ✅ Streaming response pattern for real-time progress
- ✅ Markdown output formatting
- ✅ API route structure with error handling
- ✅ Tailwind CSS styling system

**New Capabilities We'll Add:**
- 🆕 Multi-agency API queries (NSF, NIH, USAspending.gov)
- 🆕 Batch processing with combined markdown output
- 🆕 Keyword extraction from proposals
- 🆕 Funding landscape analysis
- 🆕 Data aggregation and comparison tables

## File Structure

### New Files to Create

```
pages/
  └── funding-gap-analyzer.js          # Main app page (follows existing pattern)
  
pages/api/
  └── analyze-funding.js               # Main processing endpoint
  └── query-nsf.js                     # NSF API helper (optional, can be in analyze-funding.js)
  └── query-nih.js                     # NIH API helper (optional)
  └── query-usaspending.js             # USAspending helper (optional)

lib/
  └── config.js                        # ADD new PROMPTS.FUNDING_ANALYSIS function
  └── fundingApis.js                   # NEW: API query utilities for NSF/NIH/USAspending

shared/components/
  └── FundingResults.js                # NEW: Specialized results component (optional, can use existing ResultsDisplay)
```

### Files to Modify

```
shared/components/Layout.js            # ADD new navigation link
lib/config.js                          # ADD funding analysis prompts
```

## Implementation Details

### 1. Frontend Page (`pages/funding-gap-analyzer.js`)

**Pattern:** Follow existing `batch-proposal-summaries.js` pattern

```javascript
// Key sections to implement:

// State management
const [files, setFiles] = useState([]);
const [results, setResults] = useState(null);
const [processing, setProcessing] = useState(false);
const [progress, setProgress] = useState('');
const [error, setError] = useState('');

// Configuration options (like existing dropdowns)
const [searchYears, setSearchYears] = useState(5);

// Processing flow (similar to batch-proposal-summaries.js)
const handleAnalyze = async () => {
  // 1. Upload files to Vercel Blob
  // 2. Call /api/analyze-funding
  // 3. Stream progress updates
  // 4. Display combined markdown results
};
```

**UI Components to Include:**
- `<Layout>` - Existing shared layout
- `<PageHeader>` - Title and description
- `<ApiKeyManager>` - API key management
- `<FileUploaderSimple>` - File upload (batch mode)
- Configuration dropdowns:
  - Search years back (1-10 years)
  - Include NIH checkbox
  - Include USAspending checkbox
- `<ResultsDisplay>` - Show markdown output
- Download button for markdown file

### 2. Backend API (`pages/api/analyze-funding.js`)

**Pattern:** Extend existing `/api/process.js` pattern with multi-step processing

```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    files, 
    apiKey, 
    searchYears = 5
  } = req.body;

  // Validate inputs
  if (!files || !apiKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Set up streaming response (existing pattern)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (message) => {
    res.write(`data: ${JSON.stringify({ progress: message })}\n\n`);
  };

  try {
    let allResults = [];
    
    // Process each proposal
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      sendProgress(`Processing proposal ${i + 1}/${files.length}: ${file.name}`);
      
      // Step 1: Extract text from PDF
      sendProgress(`Extracting text from ${file.name}...`);
      const text = await extractTextFromPDF(file.url);
      
      // Step 2: Use Claude to extract PI, institution, keywords
      sendProgress(`Extracting PI information and keywords...`);
      const extraction = await extractProposalInfo(text, apiKey);
      
      // Step 3: Query NSF for PI's awards
      sendProgress(`Querying NSF for ${extraction.pi}'s awards...`);
      const nsfPIAwards = await queryNSFforPI(extraction.pi, extraction.institution);
      
      // Step 4: Query NSF for research area
      sendProgress(`Analyzing NSF funding landscape...`);
      const nsfLandscape = await queryNSFforKeywords(extraction.keywords, searchYears);
      
      // Step 5: Query NIH
      sendProgress(`Querying NIH RePORTER...`);
      const nihResults = await queryNIH(extraction.pi, extraction.keywords, searchYears);
      
      // Step 6: Query USAspending
      sendProgress(`Querying USAspending.gov...`);
      const usaSpendingResults = await queryUSASpending(extraction.institution, searchYears);
      
      // Step 7: Generate analysis with Claude
      sendProgress(`Generating funding gap analysis...`);
      const analysis = await generateAnalysis({
        extraction,
        nsfPIAwards,
        nsfLandscape,
        nihResults,
        usaSpendingResults,
        apiKey
      });
      
      allResults.push({
        filename: file.name,
        extraction,
        analysis,
        metadata: {
          processedAt: new Date().toISOString(),
          searchYears
        }
      });
    }
    
    // Step 8: Generate combined markdown report
    sendProgress(`Generating combined report...`);
    const markdownReport = generateMarkdownReport(allResults, searchYears);
    
    // Send final results
    res.write(`data: ${JSON.stringify({
      complete: true,
      formatted: markdownReport,
      structured: {
        proposals: allResults.map(r => ({
          filename: r.filename,
          pi: r.extraction.pi,
          institution: r.extraction.institution,
          totalFunding: r.analysis.totalFunding,
          keywords: r.extraction.keywords
        }))
      },
      metadata: {
        proposalCount: files.length,
        searchYears,
        generatedAt: new Date().toISOString()
      }
    })}\n\n`);
    
    res.end();
    
  } catch (error) {
    console.error('Funding analysis error:', error);
    res.write(`data: ${JSON.stringify({ 
      error: error.message || 'Processing failed' 
    })}\n\n`);
    res.end();
  }
}
```

### 3. API Query Utilities (`lib/fundingApis.js`)

**New file with helper functions for external APIs**

```javascript
// NSF API Functions
export async function queryNSFforPI(piName, institution, activeOnly = true) {
  const baseUrl = 'http://api.nsf.gov/services/v1/awards.json';
  const params = new URLSearchParams({
    pdPIName: piName,
    awardeeName: institution,
    ActiveAwards: activeOnly,
    rpp: 25
  });
  
  const response = await fetch(`${baseUrl}?${params}`);
  const data = await response.json();
  
  return {
    awards: data.response?.award || [],
    totalCount: data.response?.metadata?.totalCount || 0
  };
}

export async function queryNSFforKeywords(keywords, yearsBack = 5) {
  const baseUrl = 'http://api.nsf.gov/services/v1/awards.json';
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - yearsBack);
  
  const results = {};
  
  for (const keyword of keywords) {
    const params = new URLSearchParams({
      keyword: keyword,
      dateStart: formatDate(startDate),
      dateEnd: formatDate(new Date()),
      rpp: 25
    });
    
    const response = await fetch(`${baseUrl}?${params}`);
    const data = await response.json();
    
    results[keyword] = {
      awards: data.response?.award || [],
      totalCount: data.response?.metadata?.totalCount || 0,
      totalFunding: calculateTotalFunding(data.response?.award || [])
    };
  }
  
  return results;
}

// NIH RePORTER API Functions
export async function queryNIH(piLastName, keywords, yearsBack = 5) {
  const baseUrl = 'https://api.reporter.nih.gov/v2/projects/search';
  
  // Query for PI's projects
  const piProjects = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      criteria: {
        pi_names: [{ any_name: piLastName }],
        include_active_projects: true
      },
      limit: 500
    })
  });
  
  const piData = await piProjects.json();
  
  // Query for research area
  const keywordResults = {};
  for (const keyword of keywords) {
    const keywordProjects = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        criteria: {
          advanced_text_search: {
            operator: "and",
            search_field: "abstracttext",
            search_text: keyword
          },
          fiscal_years: getFiscalYears(yearsBack)
        },
        limit: 500
      })
    });
    
    const keywordData = await keywordProjects.json();
    keywordResults[keyword] = {
      projects: keywordData.results || [],
      totalCount: keywordData.meta?.total || 0
    };
  }
  
  return {
    piProjects: piData.results || [],
    keywordResults
  };
}

// USAspending.gov API Functions
export async function queryUSASpending(institution, yearsBack = 5) {
  const baseUrl = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
  
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filters: {
        recipient_search_text: [institution],
        award_type_codes: ["02", "03", "04", "05"],
        time_period: [{
          start_date: getStartDate(yearsBack),
          end_date: getTodayDate()
        }],
        awarding_agency_codes: ["8900", "9700"] // DOE, DOD
      },
      fields: ["Award ID", "Award Amount", "Description", "Start Date", "End Date"],
      limit: 100
    })
  });
  
  const data = await response.json();
  return {
    awards: data.results || [],
    totalCount: data.page_metadata?.total || 0
  };
}

// Helper functions
function formatDate(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '/');
}

function calculateTotalFunding(awards) {
  return awards.reduce((sum, award) => sum + (award.fundsObligatedAmt || 0), 0);
}

function getFiscalYears(yearsBack) {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: yearsBack }, (_, i) => currentYear - i);
}
```

### 4. Claude Prompts (`lib/config.js`)

**Add to existing PROMPTS object:**

```javascript
export const PROMPTS = {
  // ... existing prompts ...
  
  FUNDING_EXTRACTION: (proposalText) => `
You are analyzing a research proposal to extract key information for funding analysis.

Extract the following information from this proposal:

1. Principal Investigator (PI) full name
2. Institution name (full official name)
3. Research keywords (5-15 specific scientific terms or phrases that characterize the research area)

Return ONLY a JSON object with this structure:
{
  "pi": "Full Name",
  "institution": "Institution Name",
  "keywords": ["keyword1", "keyword2", ...]
}

Proposal text:
${proposalText}

CRITICAL: Return ONLY valid JSON. No explanation, no markdown formatting, just the JSON object.
`,

  FUNDING_ANALYSIS: (data) => `
You are a funding landscape analyst. Generate a comprehensive markdown report analyzing federal funding for this research proposal.

Input Data:
${JSON.stringify(data, null, 2)}

Generate a markdown report with these sections:

# Proposal Analysis: [PI Name] - [Institution]

## Principal Investigator Current Funding

[Markdown table of PI's active awards from NSF, NIH, DOE/DOD with columns: Award ID, Title, Amount, Period, Agency/Program]

**Total Active Federal Funding: $[calculated total]**

## Research Keywords Identified

List the extracted keywords and explain why they were chosen.

## Federal Funding Landscape Analysis

### NSF Funding Landscape
For each keyword, provide:
- Number of awards (past ${data.searchYears} years)
- Total funding
- Average award size
- Trend (increasing/stable/decreasing)
- Representative recent awards (table with 3-5 examples)

### NIH Funding Landscape
[Same format as NSF]

### DOE/DOD Funding Landscape
[Same format as NSF, noting USAspending.gov limitations]

## Funding Gap Analysis

Create a summary table with indicators:
| Indicator | NSF | NIH | DOE | DOD |
|-----------|-----|-----|-----|-----|
| PI has current funding | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Area has >20 awards (${data.searchYears} yrs) | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Total funding >$10M (${data.searchYears} yrs) | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |
| Recent awards (past 2 yrs) | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ |

### Assessment

Provide:
1. Overall funding support level (well-funded / moderately funded / potential gap)
2. PI positioning analysis
3. Research area observations
4. Potential gaps or opportunities
5. Recommended actions

Be factual, objective, and data-driven. Avoid superlatives. Focus on patterns in the data.
`,

  BATCH_FUNDING_SUMMARY: (proposals) => `
Generate a summary comparison table for ${proposals.length} analyzed proposals.

Data:
${JSON.stringify(proposals, null, 2)}

Create markdown output with:

# Summary Comparison

## Overview Table
[Comparison table with columns: PI Name, Institution, Total Active Federal $, NSF Count, NIH Count, DOE/DOD Count, Primary Keywords, Gap Assessment]

## Key Findings

### Well-Funded Research Areas
[List 3-5 research areas with strong federal support]

### Potential Funding Gaps Identified
[List areas with limited federal support]

### Recommendations
[Brief recommendations for each category]

Be concise and data-driven. Highlight patterns across proposals.
`
};
```

### 5. Navigation Update (`shared/components/Layout.js`)

**Add new navigation item:**

```javascript
const navItems = [
  // ... existing items ...
  { 
    href: '/funding-gap-analyzer', 
    label: 'Funding Gap Analyzer',
    icon: '🔍' // or appropriate icon
  },
];
```

## Data Flow Architecture

```
User uploads PDFs
    ↓
Vercel Blob Storage (existing)
    ↓
Extract text (pdf-parse, existing)
    ↓
Claude API: Extract PI/institution/keywords (NEW)
    ↓
Query NSF API (NEW)
    ↓
Query NIH API (NEW)
    ↓
Query USAspending API (NEW)
    ↓
Claude API: Generate analysis (NEW)
    ↓
Combine into markdown report (NEW)
    ↓
ResultsDisplay component (existing)
    ↓
User downloads markdown file
```

## Response Streaming Pattern

**Follow existing pattern from `batch-proposal-summaries.js`:**

```javascript
// Progress messages during processing:
// - "Processing proposal 1/3: proposal1.pdf"
// - "Extracting text from proposal1.pdf..."
// - "Extracting PI information and keywords..."
// - "Found PI: John Smith at MIT"
// - "Identified 8 research keywords"
// - "Querying NSF for John Smith's awards..."
// - "Found 3 active NSF awards ($2.1M total)"
// - "Analyzing NSF funding landscape..."
// - "Querying NIH RePORTER..."
// - "Found 12 NIH projects in research area"
// - "Querying USAspending.gov..."
// - "Generating funding gap analysis..."
// - "Processing proposal 2/3: proposal2.pdf"
// ...
// - "Generating combined report..."
// - "Complete! Analysis ready."
```

## Configuration Options

**Add to page UI (following existing dropdown pattern):**

```javascript
// Search timeframe - only user-configurable option
<select value={searchYears} onChange={(e) => setSearchYears(Number(e.target.value))}>
  <option value={3}>Past 3 years</option>
  <option value={5}>Past 5 years (default)</option>
  <option value={10}>Past 10 years</option>
</select>
```

**Note:** All agencies (NSF, NIH, USAspending.gov) are queried automatically. Keywords are automatically extracted by Claude from the proposal text.

## Error Handling

**Follow existing pattern:**

```javascript
try {
  // Processing logic
} catch (error) {
  console.error('Funding analysis error:', error);
  setError(error.message || 'Analysis failed. Please try again.');
  setProcessing(false);
}
```

**Common errors to handle:**
- API rate limits (NSF, NIH, USAspending)
- Network timeouts
- Invalid PI name extraction
- No results found
- Claude API errors

## Performance Considerations

**Fresh Queries Every Time:**
- All API queries are made fresh for each analysis
- Ensures most current funding data
- No stale cache issues
- Simpler implementation and maintenance

**Rate Limiting Best Practices:**
- NSF: 1 request/second (be respectful, no documented limit)
- NIH: 100 requests/minute per IP
- USAspending: 10 requests/second per IP
- Add small delays between requests when processing multiple proposals
- Implement retry logic with exponential backoff for rate limit errors

**Estimated Processing Times:**
- Single proposal: 1-2 minutes (depending on number of keywords)
- Batch of 5 proposals: 5-10 minutes
- Most time spent on external API calls, not Claude processing

## Testing Plan

### Test Cases

1. **Single well-known PI**
   - Upload single proposal with prominent researcher
   - Verify PI name extracted correctly
   - Verify all active awards found
   - Check markdown formatting

2. **Batch mode (3 proposals)**
   - Upload 3 diverse proposals
   - Verify individual analyses generated
   - Verify summary comparison table
   - Check combined markdown structure

3. **Common name disambiguation**
   - PI with common name (e.g., "John Smith")
   - Verify institution used to disambiguate
   - Check for appropriate warnings

4. **Emerging research area**
   - Topic with limited federal funding
   - Verify gap indicators flagged
   - Check recommendation quality

5. **Error scenarios**
   - Invalid PDF
   - Network timeout
   - API rate limit
   - Missing PI name

### Success Metrics

- ✅ PI extraction accuracy >95%
- ✅ Keyword extraction generates relevant terms
- ✅ All major federal awards found for PI
- ✅ Processing completes in <3 minutes per proposal
- ✅ Markdown output is well-formatted and readable
- ✅ Batch mode generates useful comparison table

## Deployment Checklist

### Environment Variables (add to Vercel)
```
# Already exists:
CLAUDE_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-20250514

# No new variables needed (all APIs are public)
```

### Vercel Configuration
- No changes needed to `vercel.json`
- Existing serverless function timeout (5 min) is sufficient
- Existing Blob storage configuration works as-is

### Pre-deployment Testing
1. Test single proposal locally
2. Test batch mode (3 proposals) locally
3. Verify all API queries working
4. Check error handling
5. Test streaming progress updates
6. Verify markdown download

### Post-deployment Monitoring
- Check Vercel function logs for errors
- Monitor API rate limit issues
- Track processing times
- Gather user feedback on keyword extraction quality

## Future Enhancements (Post-MVP)

### Phase 2 Additions (If Needed)
- **Historical trend visualization** (funding over time charts)
- **Similar proposal matching** (find related funded projects using text similarity)
- **Enhanced keyword extraction** (option for users to review/edit keywords before analysis)
- **API response caching** (if performance becomes an issue with heavy usage)

### Phase 3 Additions
- **Private foundation databases** (Gates Foundation, HHMI, Sloan, Moore, etc.)
- **International funding** (ERC, Wellcome Trust, CIHR, etc.)
- **Citation analysis** (via Dimensions/WoS APIs to show research impact)
- **Collaboration network analysis** (co-PI networks and institutional partnerships)

## Implementation Decisions Made

✅ **Keyword extraction:** Trust Claude's automatic extraction (no user editing in MVP)
✅ **API caching:** Query fresh every time (ensures current data)
✅ **Agency coverage:** Always query all agencies (NSF, NIH, USAspending.gov)

**Remaining Questions for Future Enhancement:**

1. **Export formats beyond markdown?**
   - Excel with structured data?
   - PDF report?
   - JSON for programmatic use?

2. **Batch processing optimization:**
   - Should we add parallel processing for multiple proposals?
   - Or keep sequential to avoid rate limits?

3. **Error recovery:**
   - If one agency API fails, continue with others?
   - Or fail entire analysis?

## Next Steps for Claude Code

1. **Phase 1: Basic Functionality**
   - Create `funding-gap-analyzer.js` page
   - Create `analyze-funding.js` API endpoint
   - Implement NSF API queries
   - Test with single proposal

2. **Phase 2: Multi-Agency Support**
   - Add NIH RePORTER integration
   - Add USAspending.gov integration
   - Test with batch mode

3. **Phase 3: Polish & Deploy**
   - Refine markdown output formatting
   - Add error handling
   - Test edge cases
   - Deploy to Vercel

---

**Total Estimated Development Time:** 2-3 days
- Day 1: Core functionality (NSF only)
- Day 2: Multi-agency integration
- Day 3: Polish, testing, deployment

**Code Reuse:** ~70-80% (Layout, FileUploader, ApiKeyManager, ResultsDisplay, error handling patterns)

**New Code:** ~20-30% (API query utilities, funding analysis prompts, specialized processing logic)
