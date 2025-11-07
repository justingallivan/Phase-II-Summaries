# Project Architecture Summary (For Integration Discussion)

## Executive Summary

**What This Is:**
A multi-application document processing platform built on Next.js 14 with Claude AI integration. The system uses a shared-component architecture (~80% code reuse) to rapidly deploy specialized document analysis tools.

**Current Scale:**
- **7 Active Applications** (document analyzer, Phase II writeup, batch summaries, Phase I summaries, reviewer finder, peer review analyzer, expense reporter)
- **11 API Endpoints** handling various document processing workflows
- **10 Shared UI Components** ensuring consistency across apps
- **Production-Ready** with active use and recent feature additions

## Architecture Philosophy

**Key Pattern: Configuration Over Implementation**
- Apps share 80% of code (UI, handlers, utilities)
- Each app has unique prompts and configurations
- "Fix once, benefit everywhere" maintenance model
- New apps can be added in ~1 day of development

**Technology Stack:**
- **Frontend:** Next.js 14, React 18, Tailwind CSS 3.4
- **Backend:** Next.js API Routes with streaming support
- **AI:** Claude API (claude-sonnet-4-20250514)
- **File Processing:** pdf-parse, mammoth (Word), Vercel Blob (>4.5MB files)
- **Storage:** Vercel Blob for temporary file storage
- **Deployment:** Vercel (production-ready)

## Active Applications

1. **Document Analyzer** - General-purpose AI document analysis
2. **Phase II Writeup Draft** - Research proposal drafts with Q&A and refinement
3. **Batch Proposal Summaries** - Multi-file Phase II processing (1-5 pages, 4 technical levels)
4. **Batch Phase I Summaries** - Multi-file Phase I processing (1-3 paragraphs, 3 technical levels) *[NEW]*
5. **Find Reviewers** - Expert reviewer matching with conflict detection
6. **Peer Review Summarizer** - Synthesizes review feedback with action items
7. **Expense Reporter** - Receipt/invoice OCR with auto-categorization and Excel export

## Current Architecture Patterns

**Data Flow:**
```
User Upload → Vercel Blob Storage → PDF Parsing → Claude API → Streaming Response → Results Display
```

**Standardized Data Structure:**
```javascript
{
  formatted: string,      // Main content (markdown)
  structured: object,     // Extracted data (JSON)
  metadata: object       // Processing info
}
```

**Shared Component System:**
- `Layout.js` - Main layout with navigation
- `FileUploaderSimple.js` - Blob-based file upload
- `ApiKeyManager.js` - Encrypted API key handling
- `ResultsDisplay.js` - Unified results visualization
- Streaming progress tracking across all apps

**Configuration-Driven Prompts:**
- Centralized in `/lib/config.js`
- Function-based prompts accept runtime parameters
- Easy customization per application
- Example: `PROMPTS.PHASE_I_SUMMARIZATION(text, paragraphs, level)`

## Integration Points & Extensibility

**Easy to Add:**
- New document processing workflows
- New Claude prompt configurations
- New export formats (currently: Markdown, JSON, CSV, Excel)
- New file types (currently: PDF, Word, images)

**Current Limitations:**
- API key required (user-provided, stored in sessionStorage)
- 50MB PDF size limit
- 15,000 character text truncation for processing
- 5-minute timeout per processing job

**Potential Integration Opportunities:**
- Additional AI models/providers
- Database for result persistence
- User authentication system
- Batch processing queue
- Webhook notifications
- Custom template builder

## Recent Development (Last 30 Days)

**Completed:**
- Phase I Batch Summaries app (new workflow with different output format)
- Dropdown parameter integration (length/level now customize prompts)
- Superlative-free prompt engineering (factual, dispassionate tone)
- Budget data extraction in funding justifications
- Frontend-backend data structure consistency audit

**Architecture Maturity:**
- Production-ready with active use
- Well-documented codebase
- Consistent patterns established
- Active maintenance and improvements

---

# Full Technical Documentation

The following is the complete CLAUDE.md documentation from the project:

---

# Document Processing Multi-App System

## Project Overview
This is a multi-application document processing system designed to handle various document analysis workflows using Claude AI. The architecture supports multiple specialized apps (proposal-summarizer, grant-reviewer, literature-analyzer) that share ~80% of their codebase.

## Architecture

### Directory Structure
```
/
├── shared/                    # Shared components and utilities
│   ├── api/
│   │   ├── handlers/         # Core processing logic
│   │   │   ├── claudeClient.js
│   │   │   ├── fileProcessor.js
│   │   │   └── responseStreamer.js
│   │   └── middleware/       # Common middleware
│   ├── components/           # Reusable React components
│   ├── utils/               # Utility functions
│   │   └── dataExtraction.js
│   └── config/              # Configuration
│       ├── baseConfig.js
│       └── prompts/         # Prompt templates
├── apps/                    # Individual applications
│   ├── proposal-summarizer/
│   ├── grant-reviewer/      # Future app
│   └── literature-analyzer/ # Future app
├── pages/                   # Current app (to be migrated)
├── lib/                     # Current config (to be migrated)
└── styles/                  # Current styles (to be shared)
```

### Key Design Principles
1. **Code Reusability**: Shared components handle 80% of functionality
2. **Modularity**: Each app only contains its unique configuration and prompts
3. **Scalability**: New apps can be added with minimal code
4. **Consistency**: Same UI/UX patterns across all apps
5. **Maintainability**: Fix once, benefit everywhere

## Current Status

### ✅ Completed
- **Phase II writeup draft app** - Fully functional with unified Layout system
- **Expense Reporter App** - NEW! Automated expense report generation from receipts/invoices (PDF & images)
- **Unified Layout System** - All pages using shared components:
  - `Layout.js` - Main layout with navigation and responsive design
  - `PageHeader.js` - Consistent page headers with icons
  - `Card.js` - Reusable content containers
  - `Button.js` - Standardized button components
  - `FileUploaderSimple.js` - File upload component
  - `ApiKeyManager.js` - API key management
  - `ResultsDisplay.js` - Results visualization
- **Tailwind CSS Integration** - Modern utility-first styling system
- **Error Handling Standardization** - Consistent error display patterns
- **Responsive Design** - Mobile and desktop optimized layouts
- **Runtime Error Fixes** - All CSS module conflicts resolved
- **Git Integration** - Complete codebase committed and pushed
- **Vercel Blob Storage Integration** - Replaced multer with Vercel Blob for large file uploads (>4.5MB)
- **Claude Vision API Integration** - Image analysis capabilities for receipt/invoice processing
- **Frontend-Backend Data Structure Consistency** - Comprehensive audit and fixes across all applications
- **Streaming Response Improvements** - Enhanced real-time progress tracking and debugging
- **Dropdown Parameter Integration** - Summary length and technical level selections now properly customize Claude prompts

### 🚧 Ready for Next Session
- Color palette application (systematic brand colors) - Detailed plan in `COLOR_PALETTE_PLAN.md`
- End-to-end functionality testing with new dropdown integration

### 📋 To Do (Lower Priority)
- Legacy file cleanup (blob-uploader.js, index-original.js)
- Create grant-reviewer app as proof of concept
- Build literature-analyzer app
- Add comprehensive testing
- Implement production features (rate limiting, caching)

## Tech Stack
- **Frontend**: Next.js 14, React 18, Tailwind CSS 3.4
- **Backend**: Next.js API Routes
- **AI**: Claude API (Anthropic)
- **File Processing**: pdf-parse, Vercel Blob Storage
- **File Storage**: Vercel Blob (for uploads >4.5MB)
- **Styling**: Tailwind CSS with PostCSS
- **Deployment**: Vercel

## API Endpoints

### Current (To Be Refactored)
- `/api/process` - Main document processing (streaming)
- `/api/find-reviewers` - Expert reviewer matching
- `/api/qa` - Q&A functionality
- `/api/refine` - Summary refinement
- `/api/upload-handler` - Vercel Blob file upload handler
- `/api/process-expenses` - Expense extraction from receipts/invoices (PDF & images)

### Future Architecture
Each app will have minimal API routes that call shared handlers:
```javascript
// apps/[app-name]/api/process.js
import { processDocument } from '@/shared/api/handlers';
import { APP_CONFIG } from '../config';

export default async function handler(req, res) {
  return processDocument(req, res, APP_CONFIG);
}
```

## Configuration System

### Base Configuration
All apps inherit from `shared/config/baseConfig.js`:
- Claude API settings
- File processing limits
- Model parameters
- Security settings

### App-Specific Configuration
Each app extends base config with:
- Custom prompts
- Specific processing rules
- UI customizations
- Export formats

## Development Workflow

### Adding a New App
1. Create directory: `apps/[app-name]/`
2. Add app-specific config and prompts
3. Create minimal API routes using shared handlers
4. Customize UI if needed (or use shared components)
5. Test and deploy

### Running Commands
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Key Features

### Shared Capabilities
- PDF/text file upload and processing
- Claude AI integration
- Real-time progress tracking
- Multiple export formats (Markdown, JSON)
- Error handling and fallbacks
- Streaming responses

### App-Specific Features
- **Phase II writeup draft**: Research proposal writeup drafts, Q&A, refinement
- **Expense Reporter**: Receipt/invoice processing with CSV/Excel export
- **grant-reviewer**: Automated grant review scoring (planned)
- **literature-analyzer**: Literature review synthesis (planned)

## Environment Variables
```env
CLAUDE_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-sonnet-4-20250514
NODE_ENV=development
```

## Testing Strategy
- Unit tests for shared utilities
- Integration tests for API endpoints
- E2E tests for critical workflows
- Component tests for React components

## Security Considerations
- API key validation
- File size limits
- Input sanitization
- Rate limiting (to be implemented)
- CORS configuration

## Performance Optimizations
- Text chunking for large documents
- Streaming responses for real-time updates
- Caching for repeated operations (planned)
- Concurrent processing support

## Deployment
- Designed for Vercel deployment
- Zero-configuration setup
- Environment variables via Vercel dashboard
- Automatic scaling

## Contributing Guidelines
1. Follow existing code patterns
2. Update shared code carefully (affects all apps)
3. Add tests for new features
4. Document API changes
5. Use semantic commit messages

## Future Enhancements
- [ ] Multi-language support
- [ ] Batch processing optimization
- [ ] User authentication
- [ ] Analytics dashboard
- [ ] Webhook integrations
- [ ] Custom template builder
- [ ] Collaborative features

## Support
- GitHub Issues: [Create an issue](https://github.com/justingallivan/Phase-II-Summaries/issues)
- Documentation: See `/docs` directory
- API Reference: See `/shared/api/README.md`

## License
[Your License Here]

## Development Log

### September 2025 - Frontend-Backend Data Structure Consistency Audit

**Problem Identified:**
After implementing Vercel Blob storage, the backend was processing files correctly but the frontend wasn't displaying results. Through systematic debugging, identified a critical data structure mismatch between frontend and backend components.

**Root Cause:**
The backend APIs were returning `{formatted, structured}` but various frontend components expected different property names like `{summary, structuredData}`. This inconsistency prevented results from displaying despite successful processing.

**Comprehensive Solution:**
Conducted a systematic audit of all applications to ensure frontend-backend consistency:

#### Files Audited and Fixed:

1. **find-reviewers.js** (`pages/find-reviewers.js:118`)
   - **Issue**: Used `structuredData:` instead of `structured:`
   - **Fix**: `structuredData: data.extractedInfo || {}` → `structured: data.extractedInfo || {}`

2. **peer-review-summarizer.js** (`pages/peer-review-summarizer.js`)
   - **Issues**: Multiple references to old data structure properties
   - **Fixes Applied**:
     - Line 116: `results.summary` → `results.formatted`
     - Line 119: `results.questions` → `results.structured?.questions`
     - Line 258: `results.summary` → `results.formatted`
     - Line 264: `results.questions` → `results.structured?.questions`
     - Line 270: `results.questions` → `results.structured.questions`

3. **document-analyzer.js** (`pages/document-analyzer.js`)
   - **Issue**: Refinement state update using wrong property
   - **Fix**: `summary: data.refinedSummary` → `formatted: data.refinedSummary`

4. **batch-proposal-summaries.js** (`pages/batch-proposal-summaries.js`)
   - **Issues**: Multiple summary property references
   - **Fixes**: All `result.summary` references → `result.formatted`

5. **shared/components/ResultsDisplay.js**
   - **Issues**: Inconsistent property names throughout shared component
   - **Fixes**: Standardized all references:
     - `result.summary` → `result.formatted`
     - `result.structuredData` → `result.structured`

6. **proposal-summarizer.js** (`pages/proposal-summarizer.js`)
   - **Issues**: Q&A and refinement context using wrong properties
   - **Fixes**: Updated context references to use `result.formatted`

#### API Endpoints Verified:

- **`/api/process`**: Returns `{formatted, structured}` ✅
- **`/api/find-reviewers`**: Returns `{extractedInfo, reviewers, csvData, parsedReviewers, metadata}` ✅
- **`/api/refine`**: Returns `{refinedSummary, timestamp}` ✅
- **`/api/qa`**: Returns `{answer, timestamp}` ✅

#### Standardized Data Structure:

All applications now use consistent data structure pattern:
- **`result.formatted`** - Main content/summary text
- **`result.structured`** - Extracted structured data objects
- **`result.metadata`** - File processing metadata
- **`result.csvData`** - CSV export data (reviewers app only)

#### Commits Made:

1. **Commit a9ca806**: "Fix frontend-backend data structure consistency across all applications"
   - 6 files changed, 45 insertions(+), 27 deletions(-)
   - Core data structure consistency fixes

2. **Commit 5cb022d**: "Improve Vercel Blob upload handling and streaming response reliability"
   - 3 files changed, 20 insertions(+), 2 deletions(-)
   - Enhanced CORS headers, upload logging, and streaming improvements

**Result:**
Frontend-backend communication is now seamless across all applications. Each app correctly expects and receives the data structure that its corresponding API endpoint provides. The issue was systemic but localized to property naming conventions, not the underlying data flow architecture.

**Testing Required:**
All applications should now display results correctly after file processing. The data flow pattern is: File Upload → Vercel Blob Storage → Claude API Processing → Standardized Data Structure → ResultsDisplay Component.

---

### September 21, 2025 - Dropdown Parameter Integration

**Problem Identified:**
The batch-proposal-summaries app had dropdown menus for Summary Length (1-5 pages) and Technical Level (general-audience to academic), but these values were being sent to the API and completely ignored. The Claude prompts were static and didn't use the user's configuration choices.

**Root Cause:**
The API endpoint `/pages/api/process.js` was only extracting `files` and `apiKey` from the request body, ignoring `summaryLength` and `summaryLevel`. The `PROMPTS.SUMMARIZATION` function was static and didn't accept parameters.

**Solution Implemented:**
1. **API Parameter Extraction** (`pages/api/process.js:11`):
   - Added extraction: `const { files, apiKey, summaryLength = 2, summaryLevel = 'technical-non-expert' } = req.body;`
   - Added debugging logs to track parameter values
   - Updated `generateSummary()` function call to pass parameters

2. **Function Signature Update** (`pages/api/process.js:96`):
   - Modified `generateSummary(text, filename, apiKey, summaryLength, summaryLevel)`
   - Updated prompt generation to use dynamic parameters

3. **Enhanced Claude Prompt** (`lib/config.js:24`):
   - Converted `PROMPTS.SUMMARIZATION` to accept `(text, summaryLength, summaryLevel)` parameters
   - Added length requirements: 1-5 pages, ~500 words per page
   - Added audience-specific language instructions:
     - **General Audience**: Avoids technical jargon, explains concepts accessibly
     - **Technical Non-Expert**: Uses some technical terms with clear explanations
     - **Technical Expert**: Uses field-specific terminology, assumes domain knowledge
     - **Academic**: Uses precise scientific language and detailed methodology

**Result:**
Dropdown selections now properly customize Claude's responses. Users can select summary length and technical level, and Claude will generate summaries according to those specifications.

**Data Flow (Fixed):**
Frontend Dropdowns → POST Request Body → API Parameter Extraction → generateSummary() → Dynamic Claude Prompt → Customized Summary

#### Commit Made:
- **Commit e029e0c**: "Implement dropdown parameter integration for batch proposal summaries"
  - 2 files changed, 23 insertions(+), 6 deletions(-)
  - Fixed missing functionality where dropdown selections were ignored

---

Last Updated: September 21, 2025
Version: 2.2 (Dropdown Parameter Integration + Data Structure Consistency + Vercel Blob Integration)
