/**
 * Word Document Export for Phase II Writeups
 *
 * Client-side utility that generates .docx files matching the Keck Foundation
 * Phase II writeup template. Uses the `docx` package (dynamically imported).
 *
 * Template structure:
 *   Page 1 — Cover/Summary (institution, fields, executive summary, bullets)
 *   Page 2 — Graphical Abstract placeholder
 *   Pages 3-4 — Detailed Writeup (Background & Impact, Methodology, Personnel, placeholders)
 */

const FONT = 'Calibri';
const FONT_SIZE_BODY = 22; // half-points → 11pt
const FONT_SIZE_HEADER = 21; // half-points → 10.5pt
const FONT_SIZE_TITLE = 28; // half-points → 14pt
const FONT_SIZE_HEADING1 = 26; // half-points → 13pt
const PAGE_MARGIN = 1080; // 0.75 inches in twips (1 inch = 1440 twips)

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
    Document, Packer, Paragraph, TextRun, Header, Footer, TabStopPosition,
    TabStopType, AlignmentType, PageBreak, HeadingLevel, NumberFormat,
    UnderlineType, BorderStyle,
  } = await import('docx');

  const programAbbrev = internalFields.programType === 'Medical Research' ? 'MR' : 'SE';
  const piName = metadata.principal_investigator || '[PI Name]';
  const institutionName = metadata.institution || '[Institution]';
  const shortTitle = internalFields.shortTitle || '[Short Title]';

  // --- Header (appears on every page) ---
  const headerText = `${piName}, ${institutionName}, ${shortTitle}\tPhase II: ${programAbbrev}\tPage `;

  const pageHeader = new Header({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: TabStopPosition.MAX / 2 },
          { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
        ],
        children: [
          new TextRun({ text: `${piName}, ${institutionName}, ${shortTitle}`, size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: '\t', size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: `Phase II: ${programAbbrev}`, size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: '\t', size: FONT_SIZE_HEADER, font: FONT }),
          new TextRun({ text: 'Page ', size: FONT_SIZE_HEADER, font: FONT }),
        ],
      }),
    ],
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

  function emptyLine() {
    return new Paragraph({ children: [bodyRun('')], spacing: { after: 120 } });
  }

  /** Convert section content (which may contain <u>tags</u>) to TextRun array */
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
      bullet: { level: 0 },
      spacing: { after: 80 },
      children: [
        boldLabel(`${label}: `),
        ...contentToRuns(content),
      ],
    });
  }

  /** Create a labeled field row: "Label:\tValue" */
  function fieldRow(label, value) {
    return new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: 4320 }], // 3 inches
      spacing: { after: 40 },
      children: [
        boldLabel(`${label}:`),
        bodyRun(`\t${value || '[To be completed]'}`),
      ],
    });
  }

  // --- PAGE 1: Cover / Summary ---
  const page1Children = [
    // Institution name (bold, 14pt, centered)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: institutionName, size: FONT_SIZE_TITLE, font: FONT, bold: true })],
    }),
    // City, State (centered)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [bodyRun(metadata.city_state || internalFields.cityState || '[City, State]')],
    }),

    // Field rows
    fieldRow('Program', internalFields.programType || '[To be completed]'),
    fieldRow('Requested Amount', internalFields.requestedAmount || metadata.funding_amount || '[To be completed]'),
    fieldRow('Invited Amount', internalFields.invitedAmount || '[To be completed]'),
    fieldRow('Project Budget', internalFields.projectBudget || '[To be completed]'),
    emptyLine(),
    fieldRow('Project Title', metadata.project_title || '[To be completed]'),
    fieldRow('Staff Lead', internalFields.staffLead || '[To be completed]'),
    fieldRow('Recommendation', internalFields.recommendation || '[To be completed]'),
    emptyLine(),

    // Executive Summary
    new Paragraph({
      spacing: { after: 80 },
      children: [boldLabel('Executive Summary:')],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: contentToRuns(sections.get('Executive Summary')),
    }),

    // Bullet items
    bulletItem('Impact', sections.get('Impact')),
    bulletItem('Methodology', sections.get('Methodology Overview')),
    bulletItem('Personnel', sections.get('Personnel Overview')),
    bulletItem('Rationale for Keck Funding', sections.get('Rationale for Keck Funding')),
  ];

  // --- PAGE 2: Graphical Abstract ---
  const page2Children = [
    new Paragraph({
      children: [bodyRun('', { break: 1 })], // page break via break
      pageBreakBefore: true,
    }),
    emptyLine(),
    emptyLine(),
    emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'Insert Graphic', size: FONT_SIZE_TITLE, font: FONT, bold: true })],
    }),
    emptyLine(),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        boldLabel('Graphical Abstract: '),
        bodyRun('[Insert a graphical abstract or key figure that visually represents the proposed research. This should be a single image that conveys the main concept, approach, or expected outcome of the project.]'),
      ],
    }),
  ];

  // --- PAGES 3-4: Detailed Writeup ---
  function heading1(text) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text, size: FONT_SIZE_HEADING1, font: FONT, bold: true })],
    });
  }

  function contentParagraphs(sectionName) {
    const content = sections.get(sectionName);
    if (!content) {
      return [new Paragraph({ spacing: { after: 120 }, children: [bodyRun('[To be completed]')] })];
    }
    // Split into paragraphs on double newline
    return content.split(/\n\n+/).filter(p => p.trim()).map(para =>
      new Paragraph({
        spacing: { after: 120 },
        children: contentToRuns(para.trim()),
      })
    );
  }

  const page3Children = [
    new Paragraph({ pageBreakBefore: true, children: [] }),

    heading1('Background & Impact'),
    ...contentParagraphs('Background & Impact'),

    heading1('Methodology'),
    ...contentParagraphs('Methodology'),

    heading1('Personnel'),
    ...contentParagraphs('Personnel'),

    heading1('Referee Comments'),
    new Paragraph({
      spacing: { after: 120 },
      children: [bodyRun('[To be completed — summarize referee comments and panel discussion after review is complete.]', { italics: true })],
    }),

    heading1('Scientific Presentation'),
    new Paragraph({
      spacing: { after: 120 },
      children: [bodyRun('[To be completed — summarize the site visit presentation and Q&A after the site visit.]', { italics: true })],
    }),

    heading1('Institutional Funding History'),
    new Paragraph({
      spacing: { after: 120 },
      children: [bodyRun('[To be completed — list previous Keck Foundation grants to this institution, if any.]', { italics: true })],
    }),
  ];

  // --- Assemble document ---
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: FONT_SIZE_BODY, font: FONT },
        },
      },
    },
    numbering: {
      config: [{
        reference: 'bullet-list',
        levels: [{
          level: 0,
          format: NumberFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: PAGE_MARGIN,
            right: PAGE_MARGIN,
            bottom: PAGE_MARGIN,
            left: PAGE_MARGIN,
          },
          pageNumbers: { start: 1 },
        },
      },
      headers: { default: pageHeader },
      children: [
        ...page1Children,
        ...page2Children,
        ...page3Children,
      ],
    }],
  });

  return Packer.toBlob(doc);
}
