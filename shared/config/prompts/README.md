# Claude Prompt Architecture Documentation

## Overview

This document describes the centralized prompt management system for the multi-app document processing platform. All Claude AI prompts are organized in the `/shared/config/prompts/` directory to ensure consistency, maintainability, and reusability across applications.

## Directory Structure

```
/shared/config/prompts/
├── README.md                    # This documentation
├── common.js                    # Shared utilities and constants
├── find-reviewers.js           # Find Reviewers app prompts
├── proposal-summarizer.js      # Proposal Summarizer app prompts
├── document-analyzer.js        # Document Analyzer app prompts
├── batch-processor.js          # Batch Processor app prompts
└── peer-reviewer.js            # Peer Review Summarizer app prompts
```

## Architecture Principles

### 1. **Centralization**
- All Claude prompts are stored in one location
- Easy to find, modify, and maintain
- Version control tracks prompt evolution

### 2. **Modularity**  
- Each app has its own prompt file
- Common utilities shared across apps
- Clear separation of concerns

### 3. **Consistency**
- Standardized function naming conventions
- Common parameter patterns
- Consistent error handling

### 4. **Reusability**
- Shared utility functions
- Common formatting instructions
- Reusable prompt components

## File Descriptions

### `common.js` - Shared Utilities
Contains reusable functions and constants used across all apps:

- **Text processing utilities**: `truncateText()`, `cleanText()`
- **Common constants**: Text limits, temperature settings, token limits
- **Formatting helpers**: Markdown templates, academic formatting
- **Validation functions**: Parameter validation, error handling
- **Progress tracking**: Standard progress update objects

### `find-reviewers.js` - Expert Reviewer Matching
Prompts for the Find Reviewers app that identifies expert reviewers for grant proposals:

- `createExtractionPrompt()` - Extract structured proposal information
- `createReviewerPrompt()` - Generate expert reviewer recommendations  
- `parseExtractionResponse()` - Parse structured data from responses
- `extractProposalSection()` - Extract specific sections (abstract, etc.)

### `proposal-summarizer.js` - Phase II Writeup Drafts
Prompts for creating standardized Phase II research proposal summaries:

- `createSummarizationPrompt()` - Main proposal summarization
- `createStructuredDataExtractionPrompt()` - Extract metadata as JSON
- `createRefinementPrompt()` - Improve summaries based on feedback
- `createQAPrompt()` - Answer questions about proposals
- `enhanceFormatting()` - Format output with institutional headers

### `document-analyzer.js` - Comprehensive Document Analysis  
Prompts for general document analysis with themes, insights, and structured data:

- `createDocumentAnalysisPrompt()` - Main analysis with key points, themes
- `createMetadataExtractionPrompt()` - Extract document metadata
- `createThemeExtractionPrompt()` - Identify patterns and frameworks
- `createSummaryPrompt()` - Generate different types of summaries
- `createQuestionGenerationPrompt()` - Generate discussion questions
- `createDocumentComparisonPrompt()` - Compare multiple documents

### `batch-processor.js` - Multi-Document Processing
Prompts for processing multiple proposals with customizable length and technical level:

- `createBatchProcessingPrompt()` - Main batch processing with length/level controls
- `createBatchMetadataPrompt()` - Extract basic proposal metadata
- `createQualityAssessmentPrompt()` - Assess summary quality
- `createBatchComparisonPrompt()` - Compare multiple proposals
- `validateBatchParameters()` - Validate processing parameters

### `peer-reviewer.js` - Peer Review Analysis
Prompts for analyzing and synthesizing peer review feedback:

- `createPeerReviewAnalysisPrompt()` - Main analysis with summary and questions
- `createPeerReviewQuestionsPrompt()` - Extract questions and concerns
- `createThemeSynthesisPrompt()` - Identify common themes
- `createActionItemsPrompt()` - Generate prioritized action items
- `extractReviewerInfo()` - Parse reviewer information

## Usage Patterns

### 1. **Import Prompt Functions**
```javascript
import { createSummarizationPrompt } from '../../shared/config/prompts/proposal-summarizer';
import { TEXT_LIMITS, TEMPERATURE_SETTINGS } from '../../shared/config/prompts/common';
```

### 2. **Use Standard Parameters**
```javascript
const prompt = createSummarizationPrompt(
  documentText,
  TEXT_LIMITS.LARGE  // Use common constants
);
```

### 3. **Apply Common Utilities**
```javascript
import { truncateText, validatePromptParameters } from '../../shared/config/prompts/common';

const cleanedText = truncateText(rawText, TEXT_LIMITS.MEDIUM);
const validation = validatePromptParameters({ text: cleanedText, filename });
```

## Migration Guide

### Before Migration (Old Pattern)
```javascript
// pages/api/some-endpoint.js
const ANALYSIS_PROMPT = (text, filename) => \`
Please analyze this document...
\${text.substring(0, 15000)}
\`;

// Usage in handler
const prompt = ANALYSIS_PROMPT(documentText, filename);
```

### After Migration (New Pattern)
```javascript
// pages/api/some-endpoint.js  
import { createDocumentAnalysisPrompt } from '../../shared/config/prompts/document-analyzer';
import { TEXT_LIMITS } from '../../shared/config/prompts/common';

// Usage in handler
const prompt = createDocumentAnalysisPrompt(documentText, filename, TEXT_LIMITS.LARGE);
```

## Benefits Achieved

### 1. **Maintainability**
- Single source of truth for prompts
- Easy to update prompts across all apps
- Clear documentation and examples

### 2. **Consistency** 
- Standardized prompt formats
- Common parameter patterns
- Consistent error handling

### 3. **Reusability**
- Shared utility functions reduce duplication
- Common constants prevent inconsistencies
- Modular components can be mixed and matched

### 4. **Scalability**
- New apps can quickly adopt existing patterns
- Common functionality is instantly available
- Prompt improvements benefit all apps

### 5. **Testing & Quality**
- Centralized prompts are easier to test
- A/B testing can be implemented systematically
- Quality improvements propagate automatically

## Best Practices

### 1. **Naming Conventions**
- Use descriptive function names: `createSummarizationPrompt()`
- Include the prompt purpose: `createMetadataExtractionPrompt()`
- Use consistent verb patterns: `create`, `format`, `validate`

### 2. **Parameter Patterns**
```javascript
// Standard parameter order:
functionName(text, filename, options = {})
functionName(text, filename, textLimit = TEXT_LIMITS.LARGE)
```

### 3. **Documentation**
- Include JSDoc comments for all functions
- Specify parameter types and return values
- Provide usage examples

### 4. **Error Handling**
- Validate parameters at function entry
- Use consistent error messages from `common.js`
- Provide helpful error context

### 5. **Testing**
- Test prompts with various input types
- Validate structured output parsing
- Test edge cases (empty text, long text, etc.)

## Future Enhancements

### 1. **Prompt Versioning**
- Track prompt performance over time
- A/B test different prompt variations
- Roll back problematic prompt changes

### 2. **Prompt Templates**
- Create template system for common patterns
- Variable substitution for dynamic content
- Conditional sections based on context

### 3. **Prompt Analytics**
- Track which prompts perform best
- Monitor token usage and costs
- Identify optimization opportunities

### 4. **Multi-language Support**
- Internationalize prompt templates
- Support different cultural contexts
- Maintain consistency across languages

## Migration Checklist

When updating an API endpoint to use shared prompts:

- [ ] Identify all Claude prompts in the endpoint
- [ ] Check if equivalent functions exist in shared prompts
- [ ] Create new shared prompt functions if needed
- [ ] Import required functions from shared modules
- [ ] Replace inline prompts with function calls
- [ ] Use common constants for limits and settings
- [ ] Add parameter validation using common utilities
- [ ] Test the endpoint to ensure identical behavior
- [ ] Remove unused prompt code
- [ ] Update any related documentation

## Examples

### Basic Usage
```javascript
import { 
  createDocumentAnalysisPrompt,
  createMetadataExtractionPrompt 
} from '../../shared/config/prompts/document-analyzer';
import { TEXT_LIMITS, TEMPERATURE_SETTINGS } from '../../shared/config/prompts/common';

// In your API handler
const analysisPrompt = createDocumentAnalysisPrompt(
  documentText, 
  filename,
  TEXT_LIMITS.LARGE
);

const analysis = await claudeClient.sendMessage(analysisPrompt, {
  maxTokens: 2500,
  temperature: TEMPERATURE_SETTINGS.BALANCED
});
```

### Advanced Usage with Validation
```javascript
import { 
  createBatchProcessingPrompt,
  validateBatchParameters 
} from '../../shared/config/prompts/batch-processor';
import { validatePromptParameters } from '../../shared/config/prompts/common';

// Validate inputs
const validation = validateBatchParameters(pageLength, techLevel, files);
if (!validation.isValid) {
  return res.status(400).json({ errors: validation.errors });
}

// Process each file
for (const file of files) {
  const textValidation = validatePromptParameters({ text: file.content, filename: file.name });
  if (!textValidation.isValid) continue;
  
  const prompt = createBatchProcessingPrompt(
    file.content,
    pageLength,
    techLevel,
    file.name
  );
  
  // ... continue processing
}
```

---

## Conclusion

This centralized prompt architecture provides a solid foundation for maintaining, scaling, and improving the AI capabilities across all applications. By following these patterns and guidelines, we ensure consistent, high-quality prompts that can evolve systematically over time.

For questions or improvements to this system, please update this documentation and notify the team of changes.