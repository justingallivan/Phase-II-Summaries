# Option B: Hard Removal of Legacy Config

**Status:** Ready for implementation (after successful testing period)
**Prerequisites:** All API files migrated + 1-2 weeks of successful testing
**Risk Level:** Low (if prerequisites met)

---

## Prerequisites Checklist

Before proceeding with Option B, ensure:

- [ ] All 7 API files have been migrated to use `shared/config` (see REMAINING_API_MIGRATIONS.md)
- [ ] Build succeeds without errors (`npm run build`)
- [ ] All 9 applications tested and working:
  - [ ] Phase II Writeup Draft
  - [ ] Batch Phase I Summaries
  - [ ] Phase I Writeup Draft
  - [ ] Peer Review Summarizer
  - [ ] Find Reviewers
  - [ ] Expense Reporter
  - [ ] Funding Gap Analyzer
  - [ ] Document Analyzer
  - [ ] Batch Proposal Summaries
- [ ] Tested in production for 1-2 weeks without issues
- [ ] No deprecation warnings appearing in logs
- [ ] All team members aware of the change

---

## Option B Implementation Steps

### Step 1: Final Verification (30 minutes)

**1.1 Search for Legacy Imports**
```bash
# Search for any remaining imports from lib/config
grep -r "from.*lib/config" pages/api/
grep -r "from.*lib/config" shared/
grep -r "from.*lib/config" apps/

# Should return NO results (or only config.js itself)
```

**1.2 Check for Direct CONFIG/PROMPTS Usage**
```bash
# Search for any usage of old CONFIG or PROMPTS objects
grep -r "\\bCONFIG\\." pages/api/
grep -r "\\bPROMPTS\\." pages/api/

# Should return NO results
```

**1.3 Run Build Test**
```bash
npm run build

# Should complete successfully with no warnings
```

---

### Step 2: Remove Legacy Files (10 minutes)

**2.1 Delete Legacy Config Files**
```bash
# Delete the legacy config file
rm lib/config.legacy.js

# Delete the compatibility layer
rm lib/config.js
```

**2.2 Verify lib Directory**
```bash
# Check what remains in lib/
ls -la lib/

# Should only contain fundingApis.js (and possibly other non-config files)
```

---

### Step 3: Update Documentation (15 minutes)

**3.1 Update CLAUDE.md**

Remove references to `lib/config.js` from the architecture section.

**Before:**
```markdown
├── lib/
│   ├── config.js            # 40KB, 750+ lines (needs refactoring)
│   └── fundingApis.js       # NSF API integration
```

**After:**
```markdown
├── lib/
│   └── fundingApis.js       # NSF API integration
├── shared/config/           # ✅ All configuration
│   ├── index.js            # Unified exports
│   ├── baseConfig.js       # Base configuration
│   ├── keck-guidelines.js  # Keck Foundation guidelines
│   └── prompts/            # Organized prompt files
```

**3.2 Update TODO_CONFIG_REFACTORING.md**

Add completion note at the top:
```markdown
# TODO: Config File Refactoring (Option 3)

**Status:** ✅ COMPLETED (Option B - Hard Removal)
**Completion Date:** [DATE]
**Migration:** Soft deprecation → Tested → Hard removal complete
```

**3.3 Create MIGRATION_COMPLETE.md**

Document the completion (see template below).

---

### Step 4: Final Testing (30 minutes)

**4.1 Build Test**
```bash
npm run build

# Should complete successfully
```

**4.2 Manual Testing**

Test each application:
1. Phase II Writeup Draft - Upload, summarize, Q&A, refine
2. Batch Phase I Summaries - Upload multiple, verify Keck eval
3. Phase I Writeup Draft - Upload, verify format
4. Peer Review Summarizer - Upload reviews, check analysis
5. Funding Gap Analyzer - Upload proposal, verify NSF API
6. Find Reviewers - Upload proposal, verify recommendations
7. Expense Reporter - Upload receipts, verify extraction
8. Batch Proposal Summaries - Upload multiple, check dropdowns
9. Document Analyzer - Upload document, verify analysis

**4.3 Verify No Errors**

Check browser console and server logs for:
- No import errors
- No undefined function errors
- No deprecation warnings
- Normal application behavior

---

### Step 5: Commit and Deploy (15 minutes)

**5.1 Git Commit**
```bash
git add -A
git commit -m "Complete config refactoring (Option B): Remove legacy config files

- Deleted lib/config.js and lib/config.legacy.js
- All API files now use shared/config exclusively
- Updated documentation to reflect new architecture
- Tested all 9 applications successfully

Closes: Config refactoring initiative
See: CONFIG_MIGRATION_AUDIT.md, OPTION_B_HARD_REMOVAL.md"
```

**5.2 Push to Repository**
```bash
git push origin main
```

**5.3 Deploy to Production**
```bash
# Vercel automatically deploys on push to main
# Or manually trigger deployment if needed
vercel --prod
```

---

## Rollback Plan

If issues arise after Option B:

### Emergency Rollback
```bash
# Revert the commit
git revert HEAD

# Push the revert
git push origin main

# This will restore lib/config.js compatibility layer
```

### Alternative: Restore from Backup
```bash
# Copy lib/config.legacy.js back to lib/config.js
cp lib/config.legacy.js lib/config.js

# Commit the restore
git add lib/config.js
git commit -m "Restore lib/config.js compatibility layer"
git push origin main
```

---

## Post-Removal Benefits

After Option B is complete:

✅ **Single Source of Truth**
- All configuration in `shared/config/`
- No confusion about which config to use

✅ **Cleaner Codebase**
- Removed 750+ lines of legacy code
- Eliminated duplicate configuration

✅ **Better Organization**
- Prompts organized by application
- Clear separation of concerns

✅ **Easier Maintenance**
- Update prompts without touching API code
- Consistent import patterns

✅ **Improved Scalability**
- New apps follow established pattern
- Shared utilities benefit all apps

---

## Migration Complete Summary Template

Create `CONFIG_MIGRATION_COMPLETE.md`:

```markdown
# Config Refactoring Migration - Complete

**Migration Type:** Option A (Soft Deprecation) → Option B (Hard Removal)
**Start Date:** December 6, 2025
**Soft Deprecation:** December 6, 2025
**Hard Removal:** [DATE]
**Total Duration:** [X weeks]

## Summary

Successfully migrated from monolithic `lib/config.js` (748 lines) to organized `shared/config/` architecture.

## What Was Migrated

### Files Created
- `shared/config/keck-guidelines.js` - Keck Foundation guidelines
- `shared/config/prompts/phase-i-summaries.js` - Phase I summarization prompts
- `shared/config/prompts/phase-i-writeup.js` - Phase I writeup prompts
- `shared/config/prompts/funding-gap-analyzer.js` - Funding gap analysis prompts
- `shared/config/index.js` - Unified configuration exports

### Files Updated
- `shared/config/baseConfig.js` - Added legacy config constants
- `shared/config/prompts/proposal-summarizer.js` - Added dropdown parameter support
- All 7 API files migrated to use `shared/config`

### Files Removed
- `lib/config.js` (after soft deprecation period)
- `lib/config.legacy.js` (backup of original)

## Testing Results

All 9 applications tested successfully:
- ✅ Phase II Writeup Draft
- ✅ Batch Phase I Summaries
- ✅ Phase I Writeup Draft
- ✅ Peer Review Summarizer
- ✅ Find Reviewers
- ✅ Expense Reporter
- ✅ Funding Gap Analyzer
- ✅ Document Analyzer
- ✅ Batch Proposal Summaries

## Lessons Learned

[Document any issues encountered and how they were resolved]

## Future Recommendations

1. Continue using `shared/config/` for all new configuration
2. Add new prompt files following the established pattern
3. Keep `CONFIG_MIGRATION_AUDIT.md` as reference for similar migrations
4. Consider TypeScript for better type safety (future enhancement)
```

---

## Support

If you encounter issues during Option B removal:

1. Check `CONFIG_MIGRATION_AUDIT.md` for migration details
2. Review `REMAINING_API_MIGRATIONS.md` for API file patterns
3. Use git history to compare before/after
4. Test each application individually to isolate issues
5. Use rollback plan if necessary

---

**Last Updated:** December 6, 2025
**Status:** Ready for implementation after testing period
