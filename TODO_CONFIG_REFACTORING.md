# TODO: Config File Refactoring (Option 3)

**Status:** Planned for future session
**Priority:** Medium (improves maintainability, not urgent)
**Estimated Effort:** 2-3 hours

## Overview

Currently, all configuration and prompts are in a single `lib/config.js` file (750+ lines). This TODO outlines the plan to split this into multiple organized files for better maintainability and clarity.

## Current Structure

```
lib/
└── config.js (750+ lines)
    ├── CONFIG object (common settings)
    ├── KECK_GUIDELINES object
    └── PROMPTS object
        ├── Phase II Writeup Draft prompts
        ├── Batch Phase I Summaries prompts
        ├── Phase I Writeup Draft prompts
        ├── Peer Review Summarizer prompts
        ├── Funding Gap Analyzer prompts
        └── Shared utility prompts
```

## Target Structure

```
lib/
├── config/
│   ├── index.js                    # Main export file (re-exports everything)
│   ├── base.js                     # CONFIG object (API settings, limits)
│   ├── keck-guidelines.js          # KECK_GUIDELINES object
│   └── prompts/
│       ├── index.js                # Re-exports all prompts as PROMPTS object
│       ├── phase-ii-writeup.js     # SUMMARIZATION, REFINEMENT, QA_SYSTEM
│       ├── batch-phase-i.js        # PHASE_I_SUMMARIZATION
│       ├── phase-i-writeup.js      # PHASE_I_WRITEUP
│       ├── peer-review.js          # PEER_REVIEW_ANALYSIS, PEER_REVIEW_QUESTIONS
│       ├── funding-gap.js          # FUNDING_EXTRACTION, FUNDING_ANALYSIS, BATCH_FUNDING_SUMMARY
│       └── shared.js               # STRUCTURED_DATA_EXTRACTION
└── config.js                       # Legacy file - can be kept or removed
```

## Implementation Steps

### Phase 1: Create New Directory Structure

1. Create `lib/config/` directory
2. Create `lib/config/prompts/` subdirectory

### Phase 2: Split Configuration Files

**File: `lib/config/base.js`**
- Move `CONFIG` object from `lib/config.js`
- Export as default export
```javascript
export const CONFIG = {
  // Claude API Configuration
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  // ... rest of CONFIG
};
```

**File: `lib/config/keck-guidelines.js`**
- Move `KECK_GUIDELINES` object
- Export as default export
```javascript
export const KECK_GUIDELINES = {
  SOURCE_URL: 'https://www.wmkeck.org/research-overview/#funding-guidelines',
  // ... rest of KECK_GUIDELINES
};
```

### Phase 3: Split Prompt Files

**File: `lib/config/prompts/phase-ii-writeup.js`**
```javascript
import { CONFIG } from '../base.js';

export const SUMMARIZATION = (text, summaryLength = 2, summaryLevel = 'technical-non-expert') => {
  // ... prompt implementation
};

export const REFINEMENT = (currentSummary, feedback) => {
  // ... prompt implementation
};

export const QA_SYSTEM = (proposalContext, conversationContext, question) => {
  // ... prompt implementation
};
```

**File: `lib/config/prompts/batch-phase-i.js`**
```javascript
import { CONFIG, KECK_GUIDELINES } from '../index.js';

export const PHASE_I_SUMMARIZATION = (text, summaryLength = 1, summaryLevel = 'technical-non-expert') => {
  // ... prompt implementation
};
```

**File: `lib/config/prompts/phase-i-writeup.js`**
```javascript
import { CONFIG } from '../base.js';

export const PHASE_I_WRITEUP = (text, institution = '') => {
  // ... prompt implementation
};
```

**File: `lib/config/prompts/peer-review.js`**
```javascript
export const PEER_REVIEW_ANALYSIS = (reviewTexts) => {
  // ... prompt implementation
};

export const PEER_REVIEW_QUESTIONS = (reviewTexts) => {
  // ... prompt implementation
};
```

**File: `lib/config/prompts/funding-gap.js`**
```javascript
import { CONFIG } from '../base.js';

export const FUNDING_EXTRACTION = (proposalText) => {
  // ... prompt implementation
};

export const FUNDING_ANALYSIS = (data) => {
  // ... prompt implementation
};

export const BATCH_FUNDING_SUMMARY = (proposals, searchYears) => {
  // ... prompt implementation
};
```

**File: `lib/config/prompts/shared.js`**
```javascript
import { CONFIG } from '../base.js';

export const STRUCTURED_DATA_EXTRACTION = (text, filename) => {
  // ... prompt implementation
};
```

### Phase 4: Create Index Files

**File: `lib/config/prompts/index.js`**
```javascript
export * from './phase-ii-writeup.js';
export * from './batch-phase-i.js';
export * from './phase-i-writeup.js';
export * from './peer-review.js';
export * from './funding-gap.js';
export * from './shared.js';

// Also create PROMPTS object for backward compatibility
import * as phaseIIWriteup from './phase-ii-writeup.js';
import * as batchPhaseI from './batch-phase-i.js';
import * as phaseIWriteup from './phase-i-writeup.js';
import * as peerReview from './peer-review.js';
import * as fundingGap from './funding-gap.js';
import * as shared from './shared.js';

export const PROMPTS = {
  ...phaseIIWriteup,
  ...batchPhaseI,
  ...phaseIWriteup,
  ...peerReview,
  ...fundingGap,
  ...shared
};
```

**File: `lib/config/index.js`**
```javascript
export { CONFIG } from './base.js';
export { KECK_GUIDELINES } from './keck-guidelines.js';
export { PROMPTS } from './prompts/index.js';

// Also export individual prompts for direct import
export * from './prompts/index.js';
```

### Phase 5: Update Import Statements

Update all API files that import from `lib/config.js`:

**Files to update:**
- `pages/api/process.js`
- `pages/api/process-phase-i-writeup.js`
- `pages/api/batch-process.js`
- `pages/api/batch-process-phase-i.js`
- `pages/api/find-reviewers.js`
- `pages/api/peer-review-analysis.js`
- `pages/api/analyze-funding-gap.js`
- `pages/api/qa.js`
- `pages/api/refine.js`

**Change from:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config';
```

**Change to:**
```javascript
import { CONFIG, PROMPTS } from '../../lib/config/index';
// OR for more specific imports:
import { CONFIG } from '../../lib/config';
import { SUMMARIZATION, REFINEMENT } from '../../lib/config/prompts/phase-ii-writeup';
```

### Phase 6: Testing

1. **Run build:** `npm run build`
   - Verify no import errors
   - Check for missing exports

2. **Test each app:**
   - Phase II Writeup Draft (SUMMARIZATION, REFINEMENT, QA_SYSTEM)
   - Batch Phase I Summaries (PHASE_I_SUMMARIZATION)
   - Phase I Writeup Draft (PHASE_I_WRITEUP)
   - Peer Review Summarizer (PEER_REVIEW_ANALYSIS, PEER_REVIEW_QUESTIONS)
   - Funding Gap Analyzer (FUNDING_EXTRACTION, FUNDING_ANALYSIS)
   - Shared utilities (STRUCTURED_DATA_EXTRACTION)

3. **Verify all prompts work:**
   - Upload test PDFs to each app
   - Confirm prompts are being used correctly
   - Check that CONFIG values are accessible

### Phase 7: Cleanup

1. **Option A: Keep legacy file**
   - Rename `lib/config.js` → `lib/config.legacy.js`
   - Update to re-export from new structure
   - Add deprecation comment

2. **Option B: Remove legacy file**
   - Delete `lib/config.js`
   - Confirm all imports updated

## Benefits of This Refactoring

1. **Better Organization**
   - Each app's prompts in separate file
   - Easier to find and edit specific prompts

2. **Reduced File Size**
   - No single 750-line file
   - Each file focused on specific functionality

3. **Improved Maintainability**
   - Changes to one app's prompts don't affect others
   - Easier to add new apps

4. **Better Git History**
   - Smaller, focused commits
   - Easier to track changes to specific prompts

5. **Future Scalability**
   - Easy to add new prompt files
   - Can split further if needed (e.g., separate validation rules)

## Risks and Mitigation

**Risk 1: Import path changes break existing code**
- Mitigation: Keep `lib/config.js` as re-export during transition
- Test thoroughly before removing

**Risk 2: Circular dependencies**
- Mitigation: CONFIG is base-level, prompts import it (not vice versa)
- Use index.js files to control exports

**Risk 3: Build errors**
- Mitigation: Test build after each file creation
- Use TypeScript or JSDoc for type safety (future enhancement)

## Rollback Plan

If refactoring causes issues:
1. Revert all changes: `git revert HEAD`
2. Keep using `lib/config.js` with section dividers (current state)
3. Document specific issues encountered
4. Revisit with adjusted approach

## Success Criteria

- ✅ All API endpoints continue to work
- ✅ All apps produce correct output
- ✅ Build completes without errors
- ✅ Import statements are clear and maintainable
- ✅ Code is easier to navigate for future developers

## Estimated Timeline

- Phase 1-2: 30 minutes (directory structure + split CONFIG/KECK_GUIDELINES)
- Phase 3: 60 minutes (split all prompt files)
- Phase 4: 20 minutes (create index files)
- Phase 5: 30 minutes (update imports)
- Phase 6: 30 minutes (testing)
- Phase 7: 10 minutes (cleanup)

**Total: ~3 hours**

## Notes

- Current interim solution (Option 1 with section dividers) is working well
- This refactoring is not urgent but improves long-term maintainability
- Consider doing this when adding a new app to minimize disruption
- Can be done incrementally (one app at a time)

---

**Created:** December 5, 2025
**Last Updated:** December 5, 2025
**Status:** Ready for implementation in future session
