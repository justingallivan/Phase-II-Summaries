# PDF Export Architecture

This document describes the PDF export system and how to add it to other apps in the suite.

## Overview

PDF export uses `pdf-lib` for client-side PDF generation. The shared utility at `shared/utils/pdf-export.js` provides a fluent API for building PDF reports.

## Files

| File | Purpose |
|------|---------|
| `shared/utils/pdf-export.js` | Shared PDF generation utility |
| Uses: `pdf-lib` (already in package.json) | PDF creation library |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    App Component                         │
│  (e.g., multi-perspective-evaluator.js)                 │
├─────────────────────────────────────────────────────────┤
│  1. Import PDFReportBuilder, downloadPdf                │
│  2. Create exportAsPdf() async function                 │
│  3. Build PDF using fluent API                          │
│  4. Call downloadPdf(bytes, filename)                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              shared/utils/pdf-export.js                  │
├─────────────────────────────────────────────────────────┤
│  PDFReportBuilder class:                                │
│  - init(): Initialize PDF doc and fonts                 │
│  - addTitle(title, subtitle)                            │
│  - addSection(title, level)                             │
│  - addParagraph(text, options)                          │
│  - addBulletList(items)                                 │
│  - addKeyValue(key, value)                              │
│  - addBadge(label, type)                                │
│  - addHighlightBox(title, content)                      │
│  - addDivider()                                         │
│  - build(): Returns PDF bytes                           │
├─────────────────────────────────────────────────────────┤
│  Helper functions:                                       │
│  - downloadPdf(bytes, filename)                         │
│  - getRecommendationBadgeType(recommendation)           │
│  - getRatingBadgeType(rating)                           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      pdf-lib                             │
│  (Creates actual PDF document)                          │
└─────────────────────────────────────────────────────────┘
```

## Adding PDF Export to an App

### Step 1: Import the utility

```javascript
import {
  PDFReportBuilder,
  downloadPdf,
  getRecommendationBadgeType,  // optional
  getRatingBadgeType           // optional
} from '../shared/utils/pdf-export';
```

### Step 2: Create the export function

```javascript
const exportAsPdf = async () => {
  if (!results) return;

  try {
    const builder = new PDFReportBuilder();
    await builder.init();

    // Build your PDF content
    builder
      .addTitle('Report Title', 'Optional subtitle')
      .addMetadata('Generated', new Date().toLocaleDateString())
      .addDivider()
      .addSection('Section 1')
      .addParagraph('Your content here...')
      .addBulletList(['Item 1', 'Item 2', 'Item 3']);

    // Generate and download
    const pdfBytes = await builder.build();
    downloadPdf(pdfBytes, `report_${new Date().toISOString().split('T')[0]}.pdf`);

  } catch (error) {
    console.error('PDF export error:', error);
    // Handle error appropriately
  }
};
```

### Step 3: Add the export button

```jsx
<Button variant="secondary" onClick={exportAsPdf}>
  📄 Export PDF
</Button>
```

## PDFReportBuilder API Reference

### Initialization

```javascript
const builder = new PDFReportBuilder();
await builder.init();  // Must be called first
```

### Content Methods

| Method | Description |
|--------|-------------|
| `addTitle(title, subtitle?)` | Main title with optional subtitle |
| `addMetadata(key, value)` | Key-value metadata line |
| `addSection(title, level?)` | Section header (level 1 or 2) |
| `addParagraph(text, options?)` | Paragraph with auto-wrapping |
| `addBulletList(items, options?)` | Bullet point list |
| `addKeyValue(key, value, options?)` | Inline key-value pair |
| `addBadge(label, type)` | Colored badge (success/warning/danger/info) |
| `addHighlightBox(title, content)` | Highlighted text box |
| `addTwoColumns(left, right)` | Two-column layout |
| `addDivider()` | Horizontal line |
| `addSpace(height?)` | Vertical spacing |
| `addPage()` | Force new page |

### Options

**Paragraph options:**
```javascript
{
  fontSize: 10,           // Default: 10
  color: COLORS.darkGray, // rgb() value
  font: 'regular',        // 'regular', 'bold', 'italic'
  indent: 0               // Left indent in points
}
```

**Badge types:**
- `'success'` - Green (for Strong, Recommend)
- `'warning'` - Amber (for Moderate, Borderline)
- `'danger'` - Red (for Weak, Not Recommended)
- `'info'` - Blue
- `'default'` - Gray

### Building and Downloading

```javascript
const pdfBytes = await builder.build();
downloadPdf(pdfBytes, 'filename.pdf');
```

## Apps to Add PDF Export

The following apps currently support JSON/Markdown export and could benefit from PDF export:

| App | Page File | Priority |
|-----|-----------|----------|
| Concept Evaluator | `concept-evaluator.js` | Medium |
| Batch Phase I Summaries | `batch-phase-i-summaries.js` | High |
| Batch Phase II Summaries | `batch-proposal-summaries.js` | High |
| Literature Analyzer | `literature-analyzer.js` | Medium |
| Peer Review Summarizer | `peer-review-summarizer.js` | Medium |
| Funding Gap Analyzer | `funding-gap-analyzer.js` | Low |
| Expense Reporter | `expense-reporter.js` | Medium |
| Integrity Screener | `integrity-screener.js` | Low |

## Performance Considerations

- `pdf-lib` adds ~180KB to the page bundle
- Consider using dynamic imports for lazy loading:

```javascript
const exportAsPdf = async () => {
  const { PDFReportBuilder, downloadPdf } = await import('../shared/utils/pdf-export');
  // ... rest of function
};
```

## Fonts

The utility uses Helvetica (built into PDF spec) for maximum compatibility:
- Regular: Body text
- Bold: Headers, labels
- Oblique: Emphasis (if needed)

Custom fonts would require embedding, which increases file size significantly.
