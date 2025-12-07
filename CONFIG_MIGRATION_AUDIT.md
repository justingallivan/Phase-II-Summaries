# Config Refactoring Migration Audit

**Date:** December 6, 2025
**Status:** In Progress - Option A (Soft Deprecation)
**Goal:** Migrate from `lib/config.js` to `shared/config/` architecture

---

## Current State Analysis

### Legacy Config System (`lib/config.js`)

**File Size:** 748 lines
**Structure:**
- `CONFIG` object (lines 5-26) - API settings, limits, temperatures
- `KECK_GUIDELINES` object (lines 47-91) - Foundation guidelines
- `PROMPTS` object (lines 97-748) - All prompt templates

### Shared Config System (`shared/config/`)

**Files:**
- `baseConfig.js` - Comprehensive base configuration
- `keck-guidelines.js` - **MISSING** (needs creation)
- `prompts/` directory:
  - `common.js` - Shared utilities ✅
  - `proposal-summarizer.js` - Phase II prompts ✅
  - `find-reviewers.js` - Reviewer matching ✅
  - `peer-reviewer.js` - Peer review analysis ✅
  - `batch-processor.js` - Batch processing ✅
  - `document-analyzer.js` - Document analysis ✅
  - `phase-i-summaries.js` - **MISSING** (needs creation)
  - `phase-i-writeup.js` - **MISSING** (needs creation)
  - `funding-gap-analyzer.js` - **MISSING** (needs creation)

---

## API File Mapping

### Files Using Legacy Config (7 files)

1. **`pages/api/process.js`**
   - Imports: `CONFIG, PROMPTS`
   - Uses: `PROMPTS.SUMMARIZATION`, `PROMPTS.STRUCTURED_DATA_EXTRACTION`
   - Migration Target: `shared/config/prompts/proposal-summarizer.js` ✅ (exists)

2. **`pages/api/process-phase-i.js`**
   - Imports: `CONFIG, PROMPTS`
   - Uses: `PROMPTS.PHASE_I_SUMMARIZATION`
   - Migration Target: `shared/config/prompts/phase-i-summaries.js` ❌ (needs creation)

3. **`pages/api/process-phase-i-writeup.js`**
   - Imports: `CONFIG, PROMPTS`
   - Uses: `PROMPTS.PHASE_I_WRITEUP`
   - Migration Target: `shared/config/prompts/phase-i-writeup.js` ❌ (needs creation)

4. **`pages/api/process-peer-reviews.js`**
   - Imports: `CONFIG, PROMPTS`
   - Uses: `PROMPTS.PEER_REVIEW_ANALYSIS`, `PROMPTS.PEER_REVIEW_QUESTIONS`
   - Migration Target: `shared/config/prompts/peer-reviewer.js` ✅ (exists)

5. **`pages/api/analyze-funding-gap.js`**
   - Imports: `PROMPTS, CONFIG`
   - Uses: `PROMPTS.FUNDING_EXTRACTION`, `PROMPTS.FUNDING_ANALYSIS`, `PROMPTS.BATCH_FUNDING_SUMMARY`
   - Migration Target: `shared/config/prompts/funding-gap-analyzer.js` ❌ (needs creation)

6. **`pages/api/process-batch-simple.js`**
   - Imports: `CONFIG, PROMPTS`
   - Uses: `PROMPTS.SUMMARIZATION`, `PROMPTS.STRUCTURED_DATA_EXTRACTION`
   - Migration Target: `shared/config/prompts/batch-processor.js` ✅ (exists)

7. **`pages/api/process-proposals-simple.js`**
   - Imports: `BASE_CONFIG` (shared) + `PROMPTS` (legacy)
   - Uses: Both systems simultaneously
   - Migration Target: Use `shared/config/` only

### Files Using Shared Config (4 files)

1. **`pages/api/refine.js`**
   - Imports: `BASE_CONFIG`
   - Status: ✅ Already migrated

2. **`pages/api/qa.js`**
   - Imports: `BASE_CONFIG`
   - Status: ✅ Already migrated

3. **`pages/api/find-reviewers.js`**
   - Imports: `createExtractionPrompt, createReviewerPrompt, parseExtractionResponse` from `shared/config/prompts/find-reviewers`
   - Status: ✅ Already migrated

4. **`pages/api/analyze-documents-simple.js`**
   - Imports: `BASE_CONFIG`
   - Status: ✅ Already migrated

### Files Not Using Config (2 files)

1. **`pages/api/process-expenses.js`** - Expense reporter (no config needed)
2. **`pages/api/upload-handler.js`** - Vercel Blob upload (no config needed)

---

## Prompt Migration Matrix

| Prompt Name | In lib/config.js | Equivalent in shared/config/prompts/ | Status |
|-------------|------------------|--------------------------------------|--------|
| `SUMMARIZATION` | ✅ Line 103 | `proposal-summarizer.js` → `createSummarizationPrompt()` | ✅ Exists |
| `REFINEMENT` | ✅ Line 267 | `proposal-summarizer.js` → `createRefinementPrompt()` | ✅ Exists |
| `QA_SYSTEM` | ✅ Line 286 | `proposal-summarizer.js` → `createQAPrompt()` | ✅ Exists |
| `STRUCTURED_DATA_EXTRACTION` | ✅ Line 242 | `proposal-summarizer.js` → `createStructuredDataExtractionPrompt()` | ✅ Exists |
| `PEER_REVIEW_ANALYSIS` | ✅ Line 311 | `peer-reviewer.js` → `createPeerReviewAnalysisPrompt()` | ✅ Exists |
| `PEER_REVIEW_QUESTIONS` | ✅ Line 345 | `peer-reviewer.js` → `createPeerReviewQuestionsPrompt()` | ✅ Exists |
| `PHASE_I_SUMMARIZATION` | ✅ Line 168 | **NONE** | ❌ Needs creation |
| `PHASE_I_WRITEUP` | ✅ Line 618 | **NONE** | ❌ Needs creation |
| `FUNDING_EXTRACTION` | ✅ Line 365 | **NONE** | ❌ Needs creation |
| `FUNDING_ANALYSIS` | ✅ Line 401 | **NONE** | ❌ Needs creation |
| `BATCH_FUNDING_SUMMARY` | ✅ Line 566 | **NONE** | ❌ Needs creation |

---

## Configuration Constants Migration

### From `lib/config.js` CONFIG object

| Constant | lib/config.js | shared/config/baseConfig.js | Status |
|----------|---------------|----------------------------|--------|
| `CLAUDE_MODEL` | ✅ Line 7 | `CLAUDE.DEFAULT_MODEL` | ✅ Exists |
| `CLAUDE_API_URL` | ✅ Line 8 | `CLAUDE.API_URL` | ✅ Exists |
| `ANTHROPIC_VERSION` | ✅ Line 9 | `CLAUDE.ANTHROPIC_VERSION` | ✅ Exists |
| `DEFAULT_MAX_TOKENS` | ✅ Line 12 | `MODEL_PARAMS.DEFAULT_MAX_TOKENS` | ✅ Exists |
| `REFINEMENT_MAX_TOKENS` | ✅ Line 13 | **NONE** | ❌ Needs addition |
| `QA_MAX_TOKENS` | ✅ Line 14 | **NONE** | ❌ Needs addition |
| `SUMMARIZATION_TEMPERATURE` | ✅ Line 17 | **NONE** | ❌ Needs addition |
| `REFINEMENT_TEMPERATURE` | ✅ Line 18 | **NONE** | ❌ Needs addition |
| `QA_TEMPERATURE` | ✅ Line 19 | **NONE** | ❌ Needs addition |
| `PDF_SIZE_LIMIT` | ✅ Line 22 | `FILE_PROCESSING.PDF_SIZE_LIMIT` | ✅ Exists |
| `TEXT_TRUNCATE_LIMIT` | ✅ Line 23 | `FILE_PROCESSING.TEXT_TRUNCATE_LIMIT` | ✅ Exists |
| `QA_TEXT_TRUNCATE_LIMIT` | ✅ Line 24 | **NONE** | ❌ Needs addition |
| `FUNDING_EXTRACTION_LIMIT` | ✅ Line 25 | **NONE** | ❌ Needs addition |

---

## KECK_GUIDELINES Migration

**Current Location:** `lib/config.js` (lines 47-91)
**Target Location:** `shared/config/keck-guidelines.js`
**Status:** ❌ File needs creation

**Object Structure:**
- `SOURCE_URL` - Official guidelines URL
- `WHAT_WE_FUND` - Funding criteria text
- `WHAT_WE_DO_NOT_FUND` - Exclusion criteria text
- `getFormattedGuidelines()` - Function to format for prompts

**Used By:**
- `PROMPTS.PHASE_I_SUMMARIZATION` (line 198)
- Will be used by new `phase-i-summaries.js` prompt file

---

## Migration Tasks Checklist

### Phase 2: Create Missing Prompt Files
- [ ] Create `shared/config/prompts/phase-i-summaries.js`
  - [ ] Migrate `PHASE_I_SUMMARIZATION` → `createPhaseISummarizationPrompt()`
  - [ ] Add JSDoc documentation
  - [ ] Import `KECK_GUIDELINES` from `../keck-guidelines`

- [ ] Create `shared/config/prompts/phase-i-writeup.js`
  - [ ] Migrate `PHASE_I_WRITEUP` → `createPhaseIWriteupPrompt()`
  - [ ] Add JSDoc documentation

- [ ] Create `shared/config/prompts/funding-gap-analyzer.js`
  - [ ] Migrate `FUNDING_EXTRACTION` → `createFundingExtractionPrompt()`
  - [ ] Migrate `FUNDING_ANALYSIS` → `createFundingAnalysisPrompt()`
  - [ ] Migrate `BATCH_FUNDING_SUMMARY` → `createBatchFundingSummaryPrompt()`
  - [ ] Add JSDoc documentation

### Phase 3: Create Keck Guidelines File
- [ ] Create `shared/config/keck-guidelines.js`
  - [ ] Copy KECK_GUIDELINES object structure
  - [ ] Export as named export
  - [ ] Add documentation header

### Phase 4: Update baseConfig.js
- [ ] Add missing MODEL_PARAMS constants:
  - [ ] `REFINEMENT_MAX_TOKENS: 2500`
  - [ ] `QA_MAX_TOKENS: 1500`
  - [ ] `SUMMARIZATION_TEMPERATURE: 0.3`
  - [ ] `REFINEMENT_TEMPERATURE: 0.3`
  - [ ] `QA_TEMPERATURE: 0.4`

- [ ] Add missing FILE_PROCESSING constants:
  - [ ] `QA_TEXT_TRUNCATE_LIMIT: 10000`
  - [ ] `FUNDING_EXTRACTION_LIMIT: 6000`

### Phase 5: Update API Imports
- [ ] Update `pages/api/process.js`
- [ ] Update `pages/api/process-phase-i.js`
- [ ] Update `pages/api/process-phase-i-writeup.js`
- [ ] Update `pages/api/process-peer-reviews.js`
- [ ] Update `pages/api/analyze-funding-gap.js`
- [ ] Update `pages/api/process-batch-simple.js`
- [ ] Update `pages/api/process-proposals-simple.js`

### Phase 6: Create Unified Index
- [ ] Create `shared/config/index.js`
  - [ ] Re-export BASE_CONFIG
  - [ ] Re-export KECK_GUIDELINES
  - [ ] Re-export all prompt functions
  - [ ] Add deprecation notice for lib/config.js

### Phase 7: Soft Deprecation (Option A)
- [ ] Rename `lib/config.js` → `lib/config.legacy.js`
- [ ] Create new `lib/config.js` that re-exports from shared config
- [ ] Add deprecation warnings
- [ ] Update imports to point to legacy file temporarily

### Phase 8: Documentation
- [ ] Create `CONFIG_MIGRATION_COMPLETE.md` with summary
- [ ] Create `OPTION_B_HARD_REMOVAL.md` with instructions
- [ ] Update `CLAUDE.md` architecture section
- [ ] Update `shared/config/prompts/README.md`
- [ ] Mark `TODO_CONFIG_REFACTORING.md` as completed

---

## Testing Requirements

After migration, test each application:

1. **Phase II Writeup Draft** (`/proposal-summarizer`)
   - [ ] Upload test PDF
   - [ ] Verify summary generation
   - [ ] Test Q&A functionality
   - [ ] Test refinement

2. **Batch Phase I Summaries** (`/batch-phase-i-summaries`)
   - [ ] Upload multiple PDFs
   - [ ] Verify Keck evaluation bullets
   - [ ] Test dropdown parameters (length, level)

3. **Phase I Writeup Draft** (`/phase-i-writeup`)
   - [ ] Upload test PDF
   - [ ] Verify writeup format
   - [ ] Check institution name handling

4. **Peer Review Summarizer** (`/peer-review-summarizer`)
   - [ ] Upload review PDFs
   - [ ] Verify analysis output
   - [ ] Check questions extraction

5. **Funding Gap Analyzer** (`/funding-gap-analyzer`)
   - [ ] Upload proposal PDF
   - [ ] Verify NSF API calls
   - [ ] Check markdown report generation

6. **Find Reviewers** (`/find-reviewers`)
   - [ ] Quick smoke test (already migrated)

7. **Build Test**
   - [ ] Run `npm run build`
   - [ ] Verify no errors

---

## Rollback Plan

If issues arise during migration:

1. **Git revert** to last working commit
2. All changes are incremental and committed per phase
3. Legacy config remains functional via soft deprecation
4. Can operate with mixed config systems temporarily

---

## Post-Migration: Option B Preparation

After successful testing (1-2 weeks), Option B can be implemented:

1. Remove soft deprecation layer (`lib/config.legacy.js`)
2. Update any remaining legacy imports
3. Delete all legacy config files
4. Final testing round
5. Deploy to production

**Detailed instructions will be in `OPTION_B_HARD_REMOVAL.md`**

---

**Last Updated:** December 6, 2025
**Next Review:** After Phase 9 completion
