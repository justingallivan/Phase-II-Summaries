# Session 39 Prompt: Integrity Screener Continued

## Session 38 Summary

Major improvements to Integrity Screener name matching and search strategy, plus multi-Mac workflow setup.

### What Was Completed

1. **Name Matching Improvements**
   - Added 100+ nickname/variant mappings (Bob/Robert, Bill/William, Mike/Michael, etc.)
   - Added Asian name order swapping ("Wei Zhang" ↔ "Zhang Wei") at 85% confidence
   - Combined variant + order swap matching at 75% confidence
   - Added text-based ILIKE fallback for fuzzy database searches
   - Created test script with 41 passing tests

2. **Two-Phase Web Search Strategy**
   - Phase 1: Name-only search (catches results from prior institutions)
   - Phase 2: Name + institution search (higher confidence for current affiliation)
   - Merged and deduplicated results with tracking of which phase found each
   - Updated AI prompts to flag when results mention different institutions

3. **UI Simplification**
   - Removed role dropdown (PI, Co-PI, etc.) - not relevant for screening
   - Made institution field optional
   - Updated exports to not include role

4. **Multi-Mac Workflow Setup**
   - Updated `/start` skill: git fetch, pull if behind, repo health check
   - Updated `/stop` skill: commit changes, push to remote, verify sync
   - Set up `.git.nosync` to prevent iCloud from syncing git internals
   - Created `scripts/setup-git-nosync.sh` for setting up other Macs

### Commits
- `6e284ae` - Enhance Integrity Screener name matching with variants and order swapping
- `9bfc020` - Improve Integrity Screener search strategy and simplify UI
- `bbaa054` - Add /start and /stop skills with git housekeeping
- `dd87370` - Add .git.nosync to gitignore for iCloud compatibility
- `b3091e0` - Add setup script for .git.nosync on multiple Macs

## Potential Next Steps

### 1. Complete Dismissal Functionality
The dismissal feature currently shows an alert placeholder. To fully implement:
- Save dismissals to `screening_dismissals` table via API
- Filter out dismissed matches when displaying results
- Add UI to view/undo dismissals

### 2. Screening History Tab
Add a "History" tab to the Integrity Screener to:
- View past screenings
- Re-open previous screening results
- Update screening status (pending/reviewed/cleared/flagged)

### 3. PDF Export
Add PDF report generation for formal documentation:
- Professional formatting for sharing with committees
- Include all match details with confidence levels
- Summary page with statistics

### 4. Fix Build Error
Pre-existing issue: `next-auth/next` module not found in `pages/api/auth/link-profile.js`
- May need to update next-auth import or install missing dependency

### 5. Work Mac Setup
Run the setup script on work Mac:
```bash
cd ~/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/Programming/ClaudeCode/Grant_Review_Packages/Phase-II-Summaries
./scripts/setup-git-nosync.sh
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/services/integrity-matching-service.js` | Name matching with variants and order swapping |
| `lib/services/integrity-service.js` | Two-phase web search, main screening logic |
| `shared/config/prompts/integrity-screener.js` | AI prompts for PubPeer/News analysis |
| `pages/integrity-screener.js` | Frontend UI (simplified, no role dropdown) |
| `scripts/test-name-matching.js` | 41 tests for name matching |
| `scripts/setup-git-nosync.sh` | iCloud .git.nosync setup script |
| `.claude/skills/start/SKILL.md` | /start skill with git housekeeping |
| `.claude/skills/stop/SKILL.md` | /stop skill with push verification |

## Testing

```bash
# Test name matching
node scripts/test-name-matching.js

# Start dev server
npm run dev
# Go to: http://localhost:3000/integrity-screener
```

## Search Strategy

### Retraction Watch (Database)
1. GIN-indexed array search on normalized names
2. Text-based ILIKE fallback for middle names/variants
3. Institution used for confidence boost only (not filtering)

### PubPeer & News (Web Search)
1. **Phase 1**: Name-only search (broad - catches prior institutions)
2. **Phase 2**: Name + institution (narrow - higher confidence)
3. Results merged and deduplicated
4. AI flags when institution differs from current

## Cost Reference

- SERP API: ~$0.04 per applicant with institution (4 searches), ~$0.02 without
- Claude Haiku: ~$0.001 per applicant (result analysis)
- Retraction Watch: Free (local database)

## Git/iCloud Setup

This repo uses `.git.nosync` to prevent iCloud sync corruption:
- `.git` is a symlink to `.git.nosync`
- Use `git push/pull` to sync between Macs, not iCloud
- `/start` and `/stop` skills handle this automatically
