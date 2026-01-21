# Session 36 Prompt: Integrity Screener Refinements

## Session 35 Summary

Implemented the Applicant Integrity Screener - a new app for screening grant applicants for research integrity concerns.

### What Was Completed

1. **Database Setup (V13 Migration)**
   - `retractions` table with 68,248 Retraction Watch records
   - `integrity_screenings` table for screening history
   - `screening_dismissals` table for false positive tracking
   - GIN indexes on normalized author names for fast searching

2. **Core Functionality**
   - Retraction Watch database search with fuzzy name matching
   - PubPeer search via SERP API with Haiku summarization
   - Google News search via SERP API with Haiku filtering
   - SSE streaming for real-time progress updates
   - Results display with confidence levels (50-100%)

3. **Files Created**
   - `pages/integrity-screener.js` - Frontend
   - `pages/api/integrity-screener/screen.js` - Main screening API
   - `pages/api/integrity-screener/history.js` - History endpoint
   - `pages/api/integrity-screener/dismiss.js` - Dismissal endpoint
   - `lib/services/integrity-service.js` - Core service
   - `lib/services/integrity-matching-service.js` - Name matching
   - `shared/config/prompts/integrity-screener.js` - Haiku prompts
   - `scripts/import-retraction-watch.js` - Data import script

4. **Bug Fixes**
   - Fixed ApiKeyManager props (was using non-existent props)
   - Fixed Haiku model ID (`claude-3-5-haiku-20241022`)
   - Added `pg` package for Node.js v22 compatibility

## Potential Next Steps

### 1. Complete Dismissal Functionality
The dismissal feature currently shows an alert placeholder. To fully implement:
- Save dismissals to `screening_dismissals` table
- Filter out dismissed matches when displaying results
- Add UI to view/undo dismissals

### 2. Screening History Tab
Add a "History" tab to the Integrity Screener to:
- View past screenings
- Re-open previous screening results
- Update screening status (pending/reviewed/cleared/flagged)

### 3. Export Functionality
Add export options:
- JSON export of screening results
- PDF report generation for documentation

### 4. Name Matching Improvements
Current matching uses basic normalization. Could improve:
- Handle name variations (Bob/Robert, Bill/William)
- Better handling of Asian name formats
- Institution matching to boost confidence

### 5. Retraction Watch Data Refresh
Add a scheduled job or manual trigger to re-import Retraction Watch data periodically (they update daily).

## Key Files Reference

| File | Purpose |
|------|---------|
| `pages/integrity-screener.js` | Frontend UI |
| `lib/services/integrity-service.js` | Main screening orchestration |
| `lib/services/integrity-matching-service.js` | Name matching algorithms |
| `scripts/import-retraction-watch.js` | Retraction Watch CSV import |
| `scripts/setup-database.js` | V13 migration for database tables |

## Database Tables

```sql
-- Retraction Watch data (68,248 records)
retractions (
  id, record_id, title, authors, authors_normalized[],
  journal, publisher, subject, institution, country,
  retraction_date, original_paper_doi, retraction_nature,
  retraction_reasons[], urls
)

-- Screening history
integrity_screenings (
  id, user_profile_id, screening_type, screened_names JSONB,
  results JSONB, match_count, status, reviewed_at, notes
)

-- False positive tracking
screening_dismissals (
  id, screening_id, source, source_identifier,
  screened_name, dismissal_reason, notes
)
```

## Testing the App

1. Start dev server: `npm run dev`
2. Go to: http://localhost:3000/integrity-screener
3. Enter a name and institution
4. Click "Screen Applicants"
5. Results show matches from Retraction Watch, PubPeer, and News

## Cost Reference

- SERP API: ~$0.02 per applicant (2 searches)
- Claude Haiku: ~$0.001 per applicant
- Retraction Watch: Free (local database)
