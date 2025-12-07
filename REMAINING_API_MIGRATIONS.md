# Remaining API File Migrations

**Status:** Phase 5 - In Progress (1 of 7 complete)
**Completed:** `pages/api/process.js` ✅
**Remaining:** 6 files

---

## Migration Pattern

All remaining files follow the same pattern:

### Step 1: Update Imports

**Old Pattern:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**New Pattern:**
```javascript
import { BASE_CONFIG } from '../../shared/config/baseConfig';
import { /* specific prompt functions */ } from '../../shared/config/prompts/[prompt-file]';
// OR use unified import:
import { BASE_CONFIG, /* prompt functions */ } from '../../shared/config';
```

### Step 2: Update CONFIG References

| Old (`lib/config.js`) | New (`shared/config/baseConfig.js`) |
|----------------------|-------------------------------------|
| `CONFIG.CLAUDE_API_URL` | `BASE_CONFIG.CLAUDE.API_URL` |
| `CONFIG.CLAUDE_MODEL` | `BASE_CONFIG.CLAUDE.DEFAULT_MODEL` |
| `CONFIG.ANTHROPIC_VERSION` | `BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION` |
| `CONFIG.DEFAULT_MAX_TOKENS` | `BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS` |
| `CONFIG.REFINEMENT_MAX_TOKENS` | `BASE_CONFIG.MODEL_PARAMS.REFINEMENT_MAX_TOKENS` |
| `CONFIG.QA_MAX_TOKENS` | `BASE_CONFIG.MODEL_PARAMS.QA_MAX_TOKENS` |
| `CONFIG.SUMMARIZATION_TEMPERATURE` | `BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE` |
| `CONFIG.REFINEMENT_TEMPERATURE` | `BASE_CONFIG.MODEL_PARAMS.REFINEMENT_TEMPERATURE` |
| `CONFIG.QA_TEMPERATURE` | `BASE_CONFIG.MODEL_PARAMS.QA_TEMPERATURE` |
| `CONFIG.TEXT_TRUNCATE_LIMIT` | `BASE_CONFIG.FILE_PROCESSING.TEXT_TRUNCATE_LIMIT` |
| `CONFIG.QA_TEXT_TRUNCATE_LIMIT` | `BASE_CONFIG.FILE_PROCESSING.QA_TEXT_TRUNCATE_LIMIT` |
| `CONFIG.FUNDING_EXTRACTION_LIMIT` | `BASE_CONFIG.FILE_PROCESSING.FUNDING_EXTRACTION_LIMIT` |

### Step 3: Update PROMPTS References

| Old (`lib/config.js`) | New (`shared/config/prompts/`) |
|----------------------|-------------------------------|
| `PROMPTS.SUMMARIZATION(text, length, level)` | `createSummarizationPrompt(text, length, level)` |
| `PROMPTS.STRUCTURED_DATA_EXTRACTION(text, filename)` | `createStructuredDataExtractionPrompt(text, filename)` |
| `PROMPTS.REFINEMENT(summary, feedback)` | `createRefinementPrompt(summary, feedback)` |
| `PROMPTS.QA_SYSTEM(context, conversation, question)` | `createQAPrompt(context, conversation, question)` |
| `PROMPTS.PHASE_I_SUMMARIZATION(text, length, level)` | `createPhaseISummarizationPrompt(text, length, level, KECK_GUIDELINES)` |
| `PROMPTS.PHASE_I_WRITEUP(text, institution)` | `createPhaseIWriteupPrompt(text, institution)` |
| `PROMPTS.PEER_REVIEW_ANALYSIS(reviews)` | `createPeerReviewAnalysisPrompt(reviews)` |
| `PROMPTS.PEER_REVIEW_QUESTIONS(reviews)` | `createPeerReviewQuestionsPrompt(reviews)` |
| `PROMPTS.FUNDING_EXTRACTION(text)` | `createFundingExtractionPrompt(text)` |
| `PROMPTS.FUNDING_ANALYSIS(data)` | `createFundingAnalysisPrompt(data)` |
| `PROMPTS.BATCH_FUNDING_SUMMARY(proposals, years)` | `createBatchFundingSummaryPrompt(proposals, years)` |

---

## File-by-File Migration Instructions

### 2. `pages/api/process-phase-i.js`

**Current Imports:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG, KECK_GUIDELINES } from '../../shared/config';
import { createPhaseISummarizationPrompt } from '../../shared/config/prompts/phase-i-summaries';
```

**Usage Updates:**
- Find: `PROMPTS.PHASE_I_SUMMARIZATION(text, summaryLength, summaryLevel)`
- Replace: `createPhaseISummarizationPrompt(text, summaryLength, summaryLevel, KECK_GUIDELINES)`
- Update all `CONFIG.*` references to `BASE_CONFIG.*` using the table above

---

### 3. `pages/api/process-phase-i-writeup.js`

**Current Imports:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG } from '../../shared/config';
import { createPhaseIWriteupPrompt } from '../../shared/config/prompts/phase-i-writeup';
```

**Usage Updates:**
- Find: `PROMPTS.PHASE_I_WRITEUP(text, institution)`
- Replace: `createPhaseIWriteupPrompt(text, institution)`
- Update all `CONFIG.*` references to `BASE_CONFIG.*`

---

### 4. `pages/api/process-peer-reviews.js`

**Current Imports:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG } from '../../shared/config';
import { createPeerReviewAnalysisPrompt, createPeerReviewQuestionsPrompt } from '../../shared/config/prompts/peer-reviewer';
```

**Usage Updates:**
- Find: `PROMPTS.PEER_REVIEW_ANALYSIS(reviewTexts)`
- Replace: `createPeerReviewAnalysisPrompt(reviewTexts)`
- Find: `PROMPTS.PEER_REVIEW_QUESTIONS(reviewTexts)`
- Replace: `createPeerReviewQuestionsPrompt(reviewTexts)`
- Update all `CONFIG.*` references to `BASE_CONFIG.*`

---

### 5. `pages/api/analyze-funding-gap.js`

**Current Imports:**
```javascript
import { PROMPTS, CONFIG } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG } from '../../shared/config';
import { createFundingExtractionPrompt, createFundingAnalysisPrompt, createBatchFundingSummaryPrompt } from '../../shared/config/prompts/funding-gap-analyzer';
```

**Usage Updates:**
- Find: `PROMPTS.FUNDING_EXTRACTION(proposalText)`
- Replace: `createFundingExtractionPrompt(proposalText)`
- Find: `PROMPTS.FUNDING_ANALYSIS(data)`
- Replace: `createFundingAnalysisPrompt(data)`
- Find: `PROMPTS.BATCH_FUNDING_SUMMARY(proposals, searchYears)`
- Replace: `createBatchFundingSummaryPrompt(proposals, searchYears)`
- Update all `CONFIG.*` references to `BASE_CONFIG.*`

---

### 6. `pages/api/process-batch-simple.js`

**Current Imports:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG } from '../../shared/config';
import { createBatchProcessingPrompt } from '../../shared/config/prompts/batch-processor';
```

**Usage Updates:**
- Find prompt usage and update to `createBatchProcessingPrompt(...)`
- Update all `CONFIG.*` references to `BASE_CONFIG.*`

---

### 7. `pages/api/process-proposals-simple.js`

**Current Imports:**
```javascript
import { BASE_CONFIG } from '../../shared/config/baseConfig';
// ... other imports
import { PROMPTS } from '../../lib/config';
```

**Change To:**
```javascript
import { BASE_CONFIG } from '../../shared/config';
import { /* appropriate prompt functions */ } from '../../shared/config/prompts/[appropriate-file]';
```

**Note:** This file already uses `BASE_CONFIG` but still imports `PROMPTS` from legacy config. Need to:
1. Identify which PROMPTS functions it uses
2. Import those from shared config
3. Remove legacy import

---

## Quick Migration Script

For each file, follow these steps:

1. **Read the file** to identify which PROMPTS functions are used
2. **Update imports** at the top of the file
3. **Find/Replace CONFIG references**:
   - Use find/replace in your editor
   - Search for `CONFIG\.` and replace with appropriate `BASE_CONFIG.` path
4. **Update PROMPTS function calls**:
   - Replace `PROMPTS.FUNCTION_NAME` with `createFunctionName`
5. **Save and test** the file

---

## Common Pitfalls to Avoid

1. **Don't forget the parameter changes:**
   - `createPhaseISummarizationPrompt` needs `KECK_GUIDELINES` as 4th parameter

2. **Watch for nested CONFIG paths:**
   - Old: `CONFIG.CLAUDE_API_URL`
   - New: `BASE_CONFIG.CLAUDE.API_URL` (note the extra `.CLAUDE` level)

3. **Temperature and token settings moved:**
   - Old: `CONFIG.SUMMARIZATION_TEMPERATURE`
   - New: `BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE`

4. **Function naming convention:**
   - Old: `PROMPTS.SNAKE_CASE`
   - New: `createCamelCase`

---

## Testing After Migration

After migrating each file:

1. Run `npm run build` to check for import errors
2. Test the specific app/endpoint manually
3. Check that dropdowns and parameters still work
4. Verify API responses are identical to before migration

---

## Status Tracking

- [ ] `pages/api/process.js` ✅ **COMPLETED**
- [ ] `pages/api/process-phase-i.js`
- [ ] `pages/api/process-phase-i-writeup.js`
- [ ] `pages/api/process-peer-reviews.js`
- [ ] `pages/api/analyze-funding-gap.js`
- [ ] `pages/api/process-batch-simple.js`
- [ ] `pages/api/process-proposals-simple.js`

---

**Next Steps:** After completing these migrations, proceed to Phase 7 (Soft Deprecation).
