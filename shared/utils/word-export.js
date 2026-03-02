/**
 * Word Document Export for Phase II Writeups
 *
 * Client-side utility that generates .docx files matching the Keck Foundation
 * Phase II writeup template. Uses the `docx` package (dynamically imported).
 *
 * Template structure (from Phase II writeup template 2.25.26.docx):
 *   Page 1 — Cover/Summary (no header; institution, fields, hr, exec summary, bullets)
 *   Page 2 — Graphical Abstract placeholder (header appears)
 *   Pages 3-4 — Detailed Writeup (header appears)
 *
 * Formatting reference (extracted from template XML):
 *   Font: Times New Roman throughout; body 12pt, header 10.5pt, institution 14pt bold
 *   Heading 1: TNR 12pt bold, before 12pt, after 0
 *   Margins: 0.75" all sides
 *   Page 1 field tab: 2.3125" (3330 twips)
 *   Header tabs: center 5.5" (7920), right 7.0" (10080)
 *   Bullets: indent 547 twips, after 8pt (160 twips)
 *   Normal paragraph: after 6pt (120 twips), single line spacing
 */

// All sizes in half-points unless noted
const FONT = 'Times New Roman';
const FONT_SIZE_BODY = 24;    // 12pt
const FONT_SIZE_HEADER = 21;  // 10.5pt
const FONT_SIZE_TITLE = 28;   // 14pt
const FONT_SIZE_HEADING1 = 24; // 12pt (bold)

// Twips (1 inch = 1440 twips)
const PAGE_MARGIN = 1080;          // 0.75"
const FIELD_TAB_POS = 3330;        // 2.3125" — page 1 field values
const HEADER_CENTER_TAB = 7920;    // 5.5"
const HEADER_RIGHT_TAB = 10080;    // 7.0"
const BULLET_INDENT = 547;         // 0.38"
const BULLET_HANGING = 360;

// Spacing in twips
const SPACING_NORMAL_AFTER = 120;  // 6pt
const SPACING_BULLET_AFTER = 160;  // 8pt
const SPACING_HEADING_BEFORE = 240; // 12pt

/**
 * Generate a Phase II writeup .docx matching the Keck template.
 *
 * @param {Map<string, string>} sections - Parsed summary sections from parseSections()
 * @param {Object} metadata - Structured data from Claude extraction
 * @param {Object} internalFields - User-provided values from the export modal
 * @returns {Promise<Blob>} - The generated .docx as a Blob
 */
export async function generatePhaseIIDocument(sections, metadata, internalFields) {
  const {
    Document, Packer, Paragraph, TextRun, Header,
    TabStopType, AlignmentType, HeadingLevel, NumberFormat,
    UnderlineType, PageNumber, BorderStyle,
  } = await import('docx');

  const programAbbrev = internalFields.programType === 'Medical Research' ? 'MR' : 'SE';
  const piName = metadata.principal_investigator || '[PI Name]';
  const institutionName = metadata.institution || '[Institution]';
  const shortTitle = internalFields.shortTitle || '[Short Title]';

  // --- Header (pages 2+ only; page 1 uses titlePg to suppress) ---
  const pageHeader = new Header({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: HEADER_CENTER_TAB },
          { type: TabStopType.RIGHT, position: HEADER_RIGHT_TAB },
        ],
        children: [
          new TextRun({ text: `${piName}, ${institutionName}, ${shortTitle}`, size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: '\t', size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: `Phase II: ${programAbbrev}`, size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: '\t', size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: 'Page ', size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: FONT_SIZE_HEADER, font: FONT }),
        ],
      }),
    ],
  });

  // Empty header for page 1 (titlePg / different first page)
  const firstPageHeader = new Header({
    children: [new Paragraph({ children: [] })],
  });

  // --- Helper functions ---
  function bodyRun(text, opts = {}) {
    return new TextRun({
      text,
      size: FONT_SIZE_BODY,
      font: FONT,
      ...opts,
    });
  }

  function boldLabel(label) {
    return bodyRun(label, { bold: true });
  }

  function emptyLine(afterSpacing = SPACING_NORMAL_AFTER) {
    return new Paragraph({ children: [bodyRun('')], spacing: { after: afterSpacing } });
  }

  /** Inline page break as a run within a paragraph (matching template pattern) */
  function pageBreakParagraph() {
    return new Paragraph({
      spacing: { after: 0 },
      children: [new TextRun({ break: 1 })],
    });
  }

  /** Convert section content (which may contain <u>tags</u> and **bold**) to TextRun array */
  function contentToRuns(text) {
    if (!text) return [bodyRun('[To be completed]')];
    const runs = [];
    // Split on <u>...</u> tags to handle underlined names
    const parts = text.split(/(<u>.*?<\/u>)/g);
    for (const part of parts) {
      const uMatch = part.match(/^<u>(.*?)<\/u>$/);
      if (uMatch) {
        runs.push(bodyRun(uMatch[1], { underline: { type: UnderlineType.SINGLE } }));
      } else if (part) {
        // Also handle **bold** markdown
        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        for (const bp of boldParts) {
          const bMatch = bp.match(/^\*\*(.*?)\*\*$/);
          if (bMatch) {
            runs.push(bodyRun(bMatch[1], { bold: true }));
          } else if (bp) {
            runs.push(bodyRun(bp));
          }
        }
      }
    }
    return runs.length > 0 ? runs : [bodyRun('[To be completed]')];
  }

  /** Create a bullet paragraph with bold label and content */
  function bulletItem(label, content) {
    return new Paragraph({
      numbering: { reference: 'bullet-list', level: 0 },
      indent: { left: BULLET_INDENT, hanging: BULLET_HANGING },
      spacing: { after: SPACING_BULLET_AFTER },
      children: [
        boldLabel(`${label}: `),
        ...contentToRuns(content),
      ],
    });
  }

  /** Create a labeled field row: "Label:\tValue" with after=0 for tight layout */
  function fieldRow(label, value, afterSpacing = 0) {
    return new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: FIELD_TAB_POS }],
      spacing: { after: afterSpacing },
      children: [
        boldLabel(`${label}:`),
        bodyRun(`\t${value || '[To be completed]'}`),
      ],
    });
  }

  /** Horizontal rule (bottom border on an empty paragraph, matching template) */
  function horizontalRule() {
    return new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 },
      },
      children: [],
    });
  }

  // --- PAGE 1: Cover / Summary ---
  const page1Children = [
    // Institution name (bold, 14pt, centered, after=0)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [new TextRun({ text: institutionName, size: FONT_SIZE_TITLE, font: FONT, bold: true })],
    }),
    // City, State (centered)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: SPACING_BULLET_AFTER },
      children: [bodyRun(metadata.city_state || internalFields.cityState || '[City, State]')],
    }),

    // Field rows (after=0 for tight layout, except Project Budget and Project Title get spacing)
    fieldRow('Program', internalFields.programType || '[To be completed]'),
    fieldRow('Requested Amount', internalFields.requestedAmount || metadata.funding_amount || '[To be completed]'),
    fieldRow('Invited Amount', internalFields.invitedAmount || '[To be completed]'),
    fieldRow('Project Budget', internalFields.projectBudget || '[To be completed]', SPACING_BULLET_AFTER),
    fieldRow('Project Title', metadata.project_title || '[To be completed]', SPACING_BULLET_AFTER),
    fieldRow('Staff Lead', internalFields.staffLead || '[To be completed]'),
    fieldRow("Staff/Committee Chairs' Recommendation", internalFields.recommendation || '[To be completed]'),

    // Horizontal rule
    horizontalRule(),

    // Executive Summary
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [
        boldLabel('Executive Summary: '),
        ...contentToRuns(sections.get('Executive Summary')),
      ],
    }),
    emptyLine(SPACING_NORMAL_AFTER),

    // Bullet items
    bulletItem('Impact', sections.get('Impact')),
    bulletItem('Methodology', sections.get('Methodology Overview')),
    bulletItem('Personnel', sections.get('Personnel Overview')),
    bulletItem('Rationale for Keck Funding', sections.get('Rationale for Keck Funding')),

    // Page break after page 1
    pageBreakParagraph(),
  ];

  // --- PAGE 2: Graphical Abstract ---
  const page2Children = [
    emptyLine(0),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [new TextRun({ text: 'Insert Graphic', size: FONT_SIZE_BODY, font: FONT, bold: true })],
    }),
    emptyLine(SPACING_NORMAL_AFTER),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [
        boldLabel('Graphical Abstract: '),
        bodyRun('Describe the graphic in simple, jargon free terms; do not repeat the summary page.', { italics: true }),
      ],
    }),

    // Page break after page 2
    pageBreakParagraph(),
  ];

  // --- PAGES 3-4: Detailed Writeup ---
  function heading1(text, extraRuns = []) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: SPACING_HEADING_BEFORE, after: 0 },
      children: [
        new TextRun({ text, size: FONT_SIZE_HEADING1, font: FONT, bold: true }),
        ...extraRuns,
      ],
    });
  }

  function contentParagraphs(sectionName) {
    const content = sections.get(sectionName);
    if (!content) {
      return [new Paragraph({ spacing: { after: SPACING_NORMAL_AFTER }, children: [bodyRun('[To be completed]')] })];
    }
    // Split into paragraphs on double newline
    return content.split(/\n\n+/).filter(p => p.trim()).map(para =>
      new Paragraph({
        spacing: { after: SPACING_NORMAL_AFTER },
        children: contentToRuns(para.trim()),
      })
    );
  }

  const page3Children = [
    heading1('Background & Impact:'),
    ...contentParagraphs('Background & Impact'),

    heading1('Methodology:'),
    ...contentParagraphs('Methodology'),

    heading1('Personnel:'),
    ...contentParagraphs('Personnel'),

    heading1('Referee Comments:'),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed — summarize referee comments and panel discussion after review is complete.]', { italics: true })],
    }),

    heading1('Scientific Presentation:'),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed — summarize the site visit presentation and Q&A after the site visit.]', { italics: true })],
    }),

    // "Institutional Funding History" has non-bold inline text in brackets per template
    heading1('Institutional Funding History:', [
      new TextRun({ text: ' [# and $ of past grants]', size: FONT_SIZE_HEADING1, font: FONT, bold: false }),
    ]),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed — add a description of institution funding history if needed.]', { italics: true })],
    }),
  ];

  // --- Assemble document ---
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: FONT_SIZE_BODY, font: FONT },
          paragraph: { spacing: { after: SPACING_NORMAL_AFTER, line: 240 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: FONT_SIZE_HEADING1, font: FONT, bold: true },
          paragraph: { spacing: { before: SPACING_HEADING_BEFORE, after: 0, line: 240 } },
        },
      ],
    },
    numbering: {
      config: [{
        reference: 'bullet-list',
        levels: [{
          level: 0,
          format: NumberFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: {
              indent: { left: BULLET_INDENT, hanging: BULLET_HANGING },
            },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        titlePage: true, // Different first page — suppresses header on page 1
        page: {
          margin: {
            top: PAGE_MARGIN,
            right: PAGE_MARGIN,
            bottom: PAGE_MARGIN,
            left: PAGE_MARGIN,
            header: 720,  // 0.5"
            footer: 720,
          },
          size: {
            width: 12240,  // 8.5"
            height: 15840, // 11"
          },
          pageNumbers: { start: 1 },
        },
      },
      headers: {
        default: pageHeader,
        first: firstPageHeader,
      },
      children: [
        ...page1Children,
        ...page2Children,
        ...page3Children,
      ],
    }],
  });

  return Packer.toBlob(doc);
}
