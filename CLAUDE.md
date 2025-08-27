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
- Original Phase II writeup draft app fully functional
- Shared directory structure created
- Core shared utilities extracted:
  - `claudeClient.js` - Standardized Claude API client
  - `fileProcessor.js` - Generic file processing
  - `responseStreamer.js` - Progress streaming utilities
  - `dataExtraction.js` - Common data extraction functions
  - `baseConfig.js` - Base configuration system

### 🚧 In Progress
- Extracting reusable React components
- Refactoring Phase II writeup draft app to use shared code

### 📋 To Do
- Create shared React components
- Migrate existing app to use shared utilities
- Create grant-reviewer app as proof of concept
- Build literature-analyzer app
- Add comprehensive testing
- Implement production features (rate limiting, caching)

## Tech Stack
- **Frontend**: Next.js 14, React 18
- **Backend**: Next.js API Routes
- **AI**: Claude API (Anthropic)
- **File Processing**: pdf-parse, multer
- **Deployment**: Vercel

## API Endpoints

### Current (To Be Refactored)
- `/api/process` - Main document processing
- `/api/qa` - Q&A functionality
- `/api/refine` - Summary refinement

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

---

Last Updated: 2024
Version: 2.0 (Multi-App Architecture)