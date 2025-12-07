# Config Refactoring - Testing Instructions

**Purpose:** Verify that soft deprecation layer works correctly and all applications function normally
**When to Test:** After completing API file migrations and before Option B
**Duration:** Approximately 2-3 hours for comprehensive testing

---

## Prerequisites

- [ ] Build completed successfully (`npm run build`)
- [ ] No errors in build output
- [ ] Development server running (`npm run dev`)
- [ ] API key available for testing

---

## Testing Strategy

### Phase 1: Build Verification (5 minutes)

**1.1 Check Build Output**
```bash
npm run build
```

**Expected:**
- ✅ Build completes successfully
- ⚠️  Deprecation warnings visible (expected during soft deprecation)
- ❌ No import errors
- ❌ No undefined function errors

**1.2 Start Development Server**
```bash
npm run dev
```

**Expected:**
- Server starts on http://localhost:3000
- No crash on startup
- Deprecation warnings in console (expected)

---

## Phase 2: Application Testing (90-120 minutes)

Test each application systematically. For each app:
1. Navigate to the page
2. Upload test file(s)
3. Verify processing completes
4. Check results display correctly
5. Test any special features
6. Check browser console for errors

### App 1: Phase II Writeup Draft (/proposal-summarizer)

**Status:** ✅ MIGRATED (uses shared config)

**Test Steps:**
1. [ ] Navigate to `/proposal-summarizer`
2. [ ] Enter API key
3. [ ] Upload a test PDF proposal
4. [ ] Verify summary generates
5. [ ] Check format (Executive Summary bullets, Background, Methodology, Personnel, Keck Funding)
6. [ ] Test Q&A feature:
   - [ ] Ask a question about the proposal
   - [ ] Verify answer is relevant
7. [ ] Test refinement feature:
   - [ ] Provide feedback (e.g., "Make it more concise")
   - [ ] Verify refined summary generated
8. [ ] Download markdown
9. [ ] Check console for errors

**Expected Results:**
- Summary format correct
- Q&A works
- Refinement works
- No errors in console

---

### App 2: Batch Phase I Summaries (/batch-phase-i-summaries)

**Status:** ⏳ NOT MIGRATED (uses legacy config via compatibility layer)

**Test Steps:**
1. [ ] Navigate to `/batch-phase-i-summaries`
2. [ ] Enter API key
3. [ ] Select summary length dropdown (test: 1 paragraph)
4. [ ] Select technical level dropdown (test: technical-non-expert)
5. [ ] Upload 2-3 test PDFs
6. [ ] Verify processing for each file
7. [ ] Check each summary contains:
   - [ ] 1 paragraph answering "what is the proposal about"
   - [ ] **Impact & Timing** bullet
   - [ ] **Funding Justification** bullet (with $ amounts if in proposal)
   - [ ] **Research Classification** bullet (basic vs. applied)
   - [ ] **Keck Foundation Alignment** bullet
8. [ ] Download markdown for each
9. [ ] Test different dropdown combinations

**Expected Results:**
- Summaries generate correctly
- Dropdowns affect output (length and technical level)
- Keck evaluation appears in all summaries
- No errors

---

### App 3: Phase I Writeup Draft (/phase-i-writeup)

**Status:** ⏳ NOT MIGRATED (uses legacy config via compatibility layer)

**Test Steps:**
1. [ ] Navigate to `/phase-i-writeup`
2. [ ] Enter API key
3. [ ] Upload a test PDF
4. [ ] Verify writeup generates with exact format:
   - [ ] **Institution Name** (bold, full name, not abbreviated)
   - [ ] *Project Title* (italic, starts with "To...")
   - [ ] **Summary:** section (150-200 words)
   - [ ] **Rationale:** section with 4 bullets
5. [ ] Check bullet content:
   - [ ] Bullet 1: Significance & Impact
   - [ ] Bullet 2: Research Plan
   - [ ] Bullet 3: Team Expertise (PI names underlined)
   - [ ] Bullet 4: Foundation Opportunity
6. [ ] Verify no promotional language
7. [ ] Download markdown

**Expected Results:**
- Exact format match
- Institution name correct (not abbreviated)
- PI names underlined
- Professional tone

---

### App 4: Peer Review Summarizer (/peer-review-summarizer)

**Status:** ⏳ NOT MIGRATED (uses legacy config via compatibility layer)

**Test Steps:**
1. [ ] Navigate to `/peer-review-summarizer`
2. [ ] Enter API key
3. [ ] Upload 2-3 peer review PDFs
4. [ ] Verify analysis generates:
   - [ ] Review count mentioned
   - [ ] Grade summary
   - [ ] Reviewer details (names underlined if found)
   - [ ] Overall tone & themes
   - [ ] Key quotations (ordered from positive to critical)
   - [ ] Separate questions section
5. [ ] Download markdown

**Expected Results:**
- Comprehensive analysis
- Questions extracted
- Proper formatting

---

### App 5: Find Reviewers (/find-reviewers)

**Status:** ✅ ALREADY MIGRATED (uses shared config)

**Test Steps:**
1. [ ] Navigate to `/find-reviewers`
2. [ ] Enter API key
3. [ ] Upload a test PDF
4. [ ] Verify reviewer recommendations generate
5. [ ] Check CSV export works
6. [ ] Download recommendations

**Expected Results:**
- Reviewers suggested
- CSV exports correctly
- No errors

---

### App 6: Expense Reporter (/expense-reporter)

**Status:** ✅ NO CONFIG DEPENDENCY

**Test Steps:**
1. [ ] Navigate to `/expense-reporter`
2. [ ] Enter API key
3. [ ] Upload receipt/invoice images or PDFs
4. [ ] Verify expense extraction
5. [ ] Check CSV export
6. [ ] Download Excel export

**Expected Results:**
- Expenses extracted correctly
- Export formats work
- Image and PDF processing both work

---

### App 7: Funding Gap Analyzer (/funding-gap-analyzer)

**Status:** ⏳ NOT MIGRATED (uses legacy config via compatibility layer)

**Test Steps:**
1. [ ] Navigate to `/funding-gap-analyzer`
2. [ ] Enter API key
3. [ ] Configure options:
   - [ ] Select search years (test: 5 years)
   - [ ] Include Co-PIs checkbox (test: checked)
4. [ ] Upload a test proposal PDF
5. [ ] Verify processing:
   - [ ] PI extraction
   - [ ] NSF API queried (check for awards)
   - [ ] Markdown report generated
6. [ ] Check report sections:
   - [ ] Executive Summary
   - [ ] NSF Awards table
   - [ ] Research Keywords
   - [ ] Funding Gap Analysis table
   - [ ] Overall Assessment
7. [ ] Download markdown report
8. [ ] Test with multiple proposals (ZIP download)

**Expected Results:**
- Real NSF data fetched
- Analysis comprehensive
- Individual reports generated
- ZIP download works for batch

---

### App 8: Document Analyzer (/)

**Status:** ✅ ALREADY MIGRATED (uses shared config)

**Test Steps:**
1. [ ] Navigate to `/` (home page)
2. [ ] Enter API key
3. [ ] Upload a test document
4. [ ] Verify analysis generates
5. [ ] Download results

**Expected Results:**
- Analysis completes
- Results display
- No errors

---

### App 9: Batch Proposal Summaries (/batch-proposal-summaries)

**Status:** ⏳ NOT MIGRATED (uses legacy config via compatibility layer)

**Test Steps:**
1. [ ] Navigate to `/batch-proposal-summaries`
2. [ ] Enter API key
3. [ ] Select summary length dropdown (test: 2 pages)
4. [ ] Select technical level dropdown (test: technical-expert)
5. [ ] Upload 2-3 test PDFs
6. [ ] Verify batch processing
7. [ ] Check summaries respect dropdown settings
8. [ ] Download results

**Expected Results:**
- Batch processing works
- Dropdowns affect output
- All summaries generated
- No errors

---

## Phase 3: Integration Testing (30 minutes)

### Test 1: Dropdown Parameters
**Goal:** Verify dropdown selections customize Claude responses

**Steps:**
1. Upload same PDF to batch-phase-i-summaries
2. Test all length options (1, 2, 3 paragraphs)
3. Test all technical levels (general, technical-non-expert, technical-expert)
4. Verify output changes based on selections

**Expected:**
- Different lengths produce different paragraph counts
- Different levels produce different language complexity

### Test 2: Error Handling
**Goal:** Verify errors handled gracefully

**Steps:**
1. Try uploading non-PDF file
2. Try processing without API key
3. Try with invalid API key
4. Try with corrupted PDF

**Expected:**
- Clear error messages
- No crashes
- Graceful fallback

### Test 3: Performance
**Goal:** Verify no performance degradation

**Steps:**
1. Upload large PDF (10+ MB)
2. Process 5+ files in batch
3. Monitor processing time

**Expected:**
- Similar performance to before migration
- No timeout errors
- Progress indicators work

---

## Phase 4: Console & Log Checks (15 minutes)

### Browser Console
**Check for:**
- [ ] No unexpected errors
- [ ] Deprecation warnings present (expected during soft deprecation)
- [ ] API calls complete successfully

### Server Logs
**Check for:**
- [ ] Deprecation warnings from lib/config.js (expected)
- [ ] No import errors
- [ ] Claude API responses successful

---

## Phase 5: Comparison Testing (30 minutes)

**Goal:** Verify migrated apps behave identically to before

**Method:**
1. Save output from Phase II Writeup Draft (migrated)
2. Revert to previous version
3. Generate same output
4. Compare results

**Expected:**
- Identical or nearly identical output
- Same formatting
- Same content quality

---

## Issue Reporting

If issues found:

### Minor Issues (Low Priority)
- Log in a testing notes file
- Continue testing other apps
- Address after main testing complete

### Major Issues (High Priority)
- Stop testing
- Document exact steps to reproduce
- Check console errors
- Review recent code changes
- Consider rollback if critical

---

## Test Results Template

```markdown
# Config Refactoring Test Results

**Date:** [DATE]
**Tester:** [NAME]
**Build:** [COMMIT HASH]

## Summary
- [ ] All tests passed
- [ ] Some issues found (see below)
- [ ] Major issues - recommend rollback

## Application Results

| Application | Status | Notes |
|-------------|--------|-------|
| Phase II Writeup Draft | ✅ PASS | [notes] |
| Batch Phase I Summaries | ✅ PASS | [notes] |
| Phase I Writeup Draft | ✅ PASS | [notes] |
| Peer Review Summarizer | ✅ PASS | [notes] |
| Find Reviewers | ✅ PASS | [notes] |
| Expense Reporter | ✅ PASS | [notes] |
| Funding Gap Analyzer | ✅ PASS | [notes] |
| Document Analyzer | ✅ PASS | [notes] |
| Batch Proposal Summaries | ✅ PASS | [notes] |

## Issues Found

### Issue 1: [Title]
- **Severity:** [Low/Medium/High]
- **Application:** [App name]
- **Description:** [What happened]
- **Steps to Reproduce:** [Steps]
- **Expected:** [What should happen]
- **Actual:** [What actually happened]

## Recommendations

- [ ] Proceed with remaining API migrations
- [ ] Fix issues before continuing
- [ ] Rollback to previous version

**Approved for Production:** YES / NO
```

---

## Success Criteria

### Minimum (Required)
- [ ] Build completes successfully
- [ ] All 9 applications load without errors
- [ ] No breaking changes in functionality
- [ ] API responses working

### Ideal (Desired)
- [ ] All applications tested thoroughly
- [ ] Dropdown parameters verified working
- [ ] No regressions found
- [ ] Performance unchanged
- [ ] Ready for remaining API migrations

---

**Last Updated:** December 6, 2025
**Status:** Ready for testing
