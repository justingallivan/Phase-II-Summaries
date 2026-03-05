/**
 * Word Document Export for Phase II Writeups
 *
 * Client-side utility that generates .docx files matching the Keck Foundation
 * Phase II writeup template. Uses the `docx` package (dynamically imported).
 *
 * Template structure (from Research_Phase II_Write Up_Template J27.docx):
 *   Page 1 — Summary (no header; institution line, tab-aligned metadata, exec summary, bullets)
 *   Page 2 — Graphical Abstract placeholder (header appears)
 *   Pages 3-4 — Detailed Writeup (header appears)
 *
 * Formatting reference (extracted from template):
 *   Font: Times New Roman throughout; body 12pt, header 13pt, institution 16pt bold
 *   Section headings: TNR 12pt bold (Normal style, not Heading 1)
 *   Margins: 0.75" all sides
 *   Metadata: two-column tab-aligned layout (left fields at 2.3", right labels at 5.5", right values at 7.0")
 *   Bullets: indent 547 twips, after 8pt (160 twips)
 *   Normal paragraph: after 6pt (120 twips), single line spacing
 */

// All sizes in half-points unless noted
const FONT = 'Times New Roman';
const FONT_SIZE_BODY = 24;       // 12pt
const FONT_SIZE_HEADER = 26;     // 13pt
const FONT_SIZE_INSTITUTION = 32; // 16pt
const FONT_SIZE_HEADING = 24;    // 12pt (bold)

// Twips (1 inch = 1440 twips)
const PAGE_MARGIN = 1080;          // 0.75"
const HEADER_RIGHT_TAB = 10080;    // 7.0"
const BULLET_INDENT = 547;         // 0.38"
const BULLET_HANGING = 360;

// Metadata field tab positions
const FIELD_LEFT_TAB = 2880;       // 2.0" — left-column values
const FIELD_RIGHT_LABEL_TAB = 7920; // 5.5" — right-column labels (right-aligned)
const FIELD_RIGHT_VALUE_TAB = 8100; // 5.625" — right-column values

// Spacing in twips
const SPACING_NORMAL_AFTER = 120;  // 6pt
const SPACING_BULLET_AFTER = 160;  // 8pt
const SPACING_SECTION_BEFORE = 240; // 12pt

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
    Document, Packer, Paragraph, TextRun, Header, ImageRun,
    Table, TableRow, TableCell, WidthType,
    TabStopType, AlignmentType, NumberFormat, BorderStyle,
    UnderlineType, PageNumber, PageBreak,
  } = await import('docx');

  const programName = internalFields.programType || 'Science and Engineering';
  const institutionName = internalFields.institution || metadata.institution || '[Institution]';

  // --- Header (pages 2+ only; page 1 uses titlePg to suppress) ---
  const pageHeader = new Header({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.RIGHT, position: HEADER_RIGHT_TAB },
        ],
        children: [
          new TextRun({ text: 'Phase II Review', size: FONT_SIZE_HEADER, font: FONT }),
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

  function pageBreakParagraph() {
    return new Paragraph({
      spacing: { after: 0 },
      children: [new PageBreak()],
    });
  }

  /** Convert section content (which may contain <u>tags</u>, **bold**, and *italic*) to TextRun array */
  function contentToRuns(text) {
    if (!text) return [bodyRun('[To be completed]')];
    const runs = [];
    const parts = text.split(/(<u>.*?<\/u>)/g);
    for (const part of parts) {
      const uMatch = part.match(/^<u>(.*?)<\/u>$/);
      if (uMatch) {
        runs.push(bodyRun(uMatch[1], { underline: { type: UnderlineType.SINGLE } }));
      } else if (part) {
        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        for (const bp of boldParts) {
          const bMatch = bp.match(/^\*\*(.*?)\*\*$/);
          if (bMatch) {
            runs.push(bodyRun(bMatch[1], { bold: true }));
          } else if (bp) {
            const italicParts = bp.split(/(\*[^*]+?\*)/g);
            for (const ip of italicParts) {
              const iMatch = ip.match(/^\*(.*?)\*$/);
              if (iMatch) {
                runs.push(bodyRun(iMatch[1], { italics: true }));
              } else if (ip) {
                runs.push(bodyRun(ip));
              }
            }
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

  /** Two-column metadata row: "Left Label\tLeft Value\tRight Label\tRight Value" */
  function metadataRow(leftLabel, leftValue, rightLabel, rightValue, afterSpacing = 0) {
    return new Paragraph({
      tabStops: [
        { type: TabStopType.LEFT, position: FIELD_LEFT_TAB },
        { type: TabStopType.RIGHT, position: FIELD_RIGHT_LABEL_TAB },
        { type: TabStopType.RIGHT, position: HEADER_RIGHT_TAB },
      ],
      spacing: { after: afterSpacing },
      children: [
        boldLabel(leftLabel),
        bodyRun(`\t${leftValue || ''}`),
        boldLabel(`\t${rightLabel}`),
        bodyRun(`\t${rightValue || ''}`),
      ],
    });
  }

  /** Horizontal rule (bottom border on an empty paragraph) */
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

  const projectTitle = internalFields.projectTitle || metadata.project_title || '[Project Title]';
  const meetingDate = internalFields.meetingDate || metadata.meeting_date || '';
  const requestedAmount = internalFields.requestedAmount || metadata.funding_amount || '';
  const invitedAmount = internalFields.invitedAmount || metadata.invited_amount || '';
  const projectBudget = internalFields.projectBudget || metadata.total_project_cost || '';
  const staffLead = internalFields.staffLead || '';
  const cityState = internalFields.cityState || metadata.city_state || '';

  // Fetch the Keck Foundation logo for page 1
  let logoImageData = null;
  try {
    const response = await fetch('/keck-logo.png');
    if (response.ok) {
      logoImageData = await response.arrayBuffer();
    }
  } catch (e) {
    console.warn('Could not load Keck logo:', e);
  }

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
  };

  // Logo cell (left) — image scaled to ~2.5" wide, maintaining aspect ratio (510x146 → 2.5" x 0.72")
  const logoCell = new TableCell({
    width: { size: 40, type: WidthType.PERCENTAGE },
    borders: noBorders,
    verticalAlign: 'top',
    children: logoImageData ? [
      new Paragraph({
        spacing: { after: 0 },
        children: [
          new ImageRun({
            data: logoImageData,
            transformation: { width: 204, height: 58 },
            type: 'png',
          }),
        ],
      }),
    ] : [new Paragraph({ children: [] })],
  });

  // Institution info cell (right)
  const institutionCell = new TableCell({
    width: { size: 60, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [new TextRun({ text: institutionName, size: FONT_SIZE_INSTITUTION, font: FONT, bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [bodyRun(cityState)],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [bodyRun(`${programName} - Phase II Review`)],
      }),
    ],
  });

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [logoCell, institutionCell],
      }),
    ],
  });

  const page1Children = [
    // Logo + Institution header
    headerTable,

    // Blank line after header
    emptyLine(0),

    // Project Title row
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: HEADER_RIGHT_TAB }],
      spacing: { after: SPACING_BULLET_AFTER },
      children: [
        boldLabel('Project Title'),
        bodyRun(`\t${projectTitle}`),
      ],
    }),

    // Empty line before financial fields
    emptyLine(0),

    // Two-column metadata rows
    metadataRow('Meeting Date', meetingDate, 'Requested Amount', requestedAmount),
    metadataRow('Staff Lead', staffLead, 'Invited Amount', invitedAmount),
    metadataRow('Recommendation', 'Approve for', 'Project Budget', projectBudget),

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

  // --- PAGES 3+: Detailed Writeup ---
  /** Bold section heading (Normal style, not Heading 1) */
  function sectionHeading(text) {
    return new Paragraph({
      spacing: { before: SPACING_SECTION_BEFORE, after: 0 },
      children: [bodyRun(text, { bold: true })],
    });
  }

  function contentParagraphs(sectionName) {
    const content = sections.get(sectionName);
    if (!content) {
      return [new Paragraph({ spacing: { after: SPACING_NORMAL_AFTER }, children: [bodyRun('[To be completed]')] })];
    }
    return content.split(/\n\n+/).filter(p => p.trim()).map(para =>
      new Paragraph({
        spacing: { after: SPACING_NORMAL_AFTER },
        children: contentToRuns(para.trim()),
      })
    );
  }

  const page3Children = [
    sectionHeading('Background & Impact:'),
    ...contentParagraphs('Background & Impact'),

    emptyLine(0),
    sectionHeading('Methodology:'),
    ...contentParagraphs('Methodology'),

    emptyLine(0),
    sectionHeading('Personnel:'),
    ...contentParagraphs('Personnel'),

    emptyLine(0),
    sectionHeading('Referee Comments:'),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed]', { italics: true })],
    }),

    emptyLine(0),
    sectionHeading('Scientific Presentation:'),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed]', { italics: true })],
    }),

    emptyLine(0),
    sectionHeading('Institutional Funding History:'),
    new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER },
      children: [bodyRun('[To be completed]', { italics: true })],
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
