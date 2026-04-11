/**
 * Word Document Export for Grant Reporting
 *
 * Client-side utility that generates a .docx file matching the W.M. Keck
 * Foundation final report template. Built from the field schema (Header /
 * Counts / Narratives / Goals Assessment) — staff should drop the actual
 * `Final Report Template.docx` into `public/templates/` for visual parity QA
 * before merging.
 *
 * The `docx` package is dynamically imported so this only loads in the browser
 * when an export is triggered.
 */

// Half-points unless noted
const FONT = 'Times New Roman';
const FONT_SIZE_BODY = 24;       // 12pt
const FONT_SIZE_HEADING = 26;    // 13pt bold
const FONT_SIZE_TITLE = 32;      // 16pt bold

// Twips (1 inch = 1440 twips)
const PAGE_MARGIN = 1080;        // 0.75"
const SPACING_NORMAL_AFTER = 120;   // 6pt
const SPACING_SECTION_BEFORE = 240; // 12pt

const STATUS_LABELS = {
  achieved: 'Achieved',
  partial: 'Partial',
  not_addressed: 'Not Addressed',
  pivoted: 'Pivoted',
};

const RATING_LABELS = {
  successful: 'Successful',
  mixed: 'Mixed',
  unsuccessful: 'Unsuccessful',
};

/**
 * Generate a Grant Report .docx from the form data.
 *
 * @param {Object} formData
 * @param {Object} formData.header
 * @param {Object} formData.counts
 * @param {Object} formData.narratives
 * @param {Object|null} formData.goalsAssessment
 * @returns {Promise<Blob>}
 */
export async function generateGrantReportDocument(formData) {
  const {
    Document, Packer, Paragraph, TextRun,
    Table, TableRow, TableCell, WidthType,
    AlignmentType, BorderStyle, UnderlineType, HeightRule,
  } = await import('docx');

  const header = formData?.header || {};
  const counts = formData?.counts || {};
  const narratives = formData?.narratives || {};
  const goals = formData?.goalsAssessment || null;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function bodyRun(text, opts = {}) {
    return new TextRun({
      text: text == null ? '' : String(text),
      size: FONT_SIZE_BODY,
      font: FONT,
      ...opts,
    });
  }

  function boldLabel(label) {
    return bodyRun(label, { bold: true });
  }

  function emptyLine(after = SPACING_NORMAL_AFTER) {
    return new Paragraph({ children: [bodyRun('')], spacing: { after } });
  }

  /** Inline-markup parser: <u>underline</u>, **bold**, *italic* */
  function contentToRuns(text) {
    if (!text) return [bodyRun('')];
    const runs = [];
    const parts = String(text).split(/(<u>.*?<\/u>)/g);
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
    return runs.length > 0 ? runs : [bodyRun('')];
  }

  function paragraphsFromText(text, opts = {}) {
    if (!text || !String(text).trim()) {
      return [
        new Paragraph({
          spacing: { after: SPACING_NORMAL_AFTER },
          children: [bodyRun('[Not provided]', { italics: true })],
        }),
      ];
    }
    return String(text)
      .split(/\n\n+/)
      .filter(p => p.trim())
      .map(p =>
        new Paragraph({
          spacing: { after: SPACING_NORMAL_AFTER },
          children: contentToRuns(p.trim()),
          ...opts,
        }),
      );
  }

  function sectionHeading(text) {
    return new Paragraph({
      spacing: { before: SPACING_SECTION_BEFORE, after: SPACING_NORMAL_AFTER },
      children: [
        new TextRun({ text, size: FONT_SIZE_HEADING, font: FONT, bold: true }),
      ],
    });
  }

  function fieldLine(label, value) {
    return new Paragraph({
      spacing: { after: SPACING_NORMAL_AFTER / 2 },
      children: [
        boldLabel(`${label}: `),
        bodyRun(value || '—'),
      ],
    });
  }

  function fmtCount(val) {
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  }

  function countCell(text, opts = {}) {
    return new TableCell({
      width: opts.width || { size: 50, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          spacing: { after: 0 },
          children: [
            opts.bold
              ? boldLabel(text)
              : bodyRun(text),
          ],
        }),
      ],
    });
  }

  function countsRow(label, value) {
    return new TableRow({
      children: [
        countCell(label, { bold: true, width: { size: 65, type: WidthType.PERCENTAGE } }),
        countCell(fmtCount(value), { width: { size: 35, type: WidthType.PERCENTAGE } }),
      ],
    });
  }

  // ─── Page 1: Header block ────────────────────────────────────────────────

  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: SPACING_NORMAL_AFTER },
    children: [
      new TextRun({
        text: 'Grant Final Report',
        size: FONT_SIZE_TITLE,
        font: FONT,
        bold: true,
      }),
    ],
  });

  const projectTitlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: SPACING_SECTION_BEFORE },
    children: [
      new TextRun({
        text: header.title || '[Project Title]',
        size: FONT_SIZE_HEADING,
        font: FONT,
        bold: true,
      }),
    ],
  });

  const pisLine = (header.pis && header.pis.length > 0)
    ? header.pis.join(', ')
    : '';

  const headerBlock = [
    titlePara,
    projectTitlePara,
    fieldLine('PI(s)', pisLine),
    fieldLine('Award Amount', header.award_amount),
    fieldLine('Project Time Period', header.project_period),
    fieldLine('Subject Area', header.subject_area),
  ];

  // Purpose
  const purposeBlock = [
    sectionHeading('Purpose of Grant'),
    ...paragraphsFromText(header.purpose),
  ];

  // Abstract
  const abstractBlock = [
    sectionHeading('Proposal Abstract'),
    ...paragraphsFromText(header.abstract),
  ];

  // ─── Counts table ────────────────────────────────────────────────────────

  const countsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      countsRow('Postdocs', counts.postdocs),
      countsRow('Graduate Students', counts.grad_students),
      countsRow('Undergraduate Students', counts.undergrads),
      countsRow('Total Publications', counts.total_publications),
      countsRow('Peer-Reviewed Publications', counts.peer_reviewed_publications),
      countsRow('Non-Peer-Reviewed Publications', counts.non_peer_reviewed_publications),
      countsRow('Patents Awarded', counts.patents_awarded),
      countsRow('Patents Submitted', counts.patents_submitted),
      countsRow('Additional Funding Secured', counts.additional_funding_secured),
    ],
  });

  const countsBlock = [
    sectionHeading('Personnel & Outputs'),
    countsTable,
    emptyLine(SPACING_NORMAL_AFTER),
  ];

  // ─── Narrative blocks ────────────────────────────────────────────────────

  const narrativesBlock = [
    sectionHeading('Project Impacts'),
    ...paragraphsFromText(narratives.project_impacts),

    sectionHeading('Awards and Honors'),
    ...paragraphsFromText(narratives.awards_and_honors),

    sectionHeading('Two Most Significant Publications'),
    ...publicationBlock(narratives.publication_1, 1),
    emptyLine(0),
    ...publicationBlock(narratives.publication_2, 2),

    sectionHeading('Implications for Future Grantmaking'),
    ...paragraphsFromText(narratives.implications_for_future_grantmaking),
  ];

  function publicationBlock(pub, index) {
    if (!pub || (!pub.citation && !pub.abstract)) {
      return [
        new Paragraph({
          spacing: { after: SPACING_NORMAL_AFTER },
          children: [bodyRun(`Publication ${index}: [Not provided]`, { italics: true })],
        }),
      ];
    }
    const out = [];
    out.push(
      new Paragraph({
        spacing: { after: SPACING_NORMAL_AFTER / 2 },
        children: [
          boldLabel(`Publication ${index}: `),
          bodyRun(pub.citation || ''),
        ],
      }),
    );
    if (pub.abstract) {
      const sourceLabel = pub.source === 'summarized' ? ' [summarized]' : '';
      out.push(
        new Paragraph({
          spacing: { after: SPACING_NORMAL_AFTER },
          children: [
            boldLabel(`Abstract${sourceLabel}: `),
            ...contentToRuns(pub.abstract),
          ],
        }),
      );
    }
    return out;
  }

  // ─── Goals Assessment block (only if present) ────────────────────────────

  const goalsBlock = goals ? buildGoalsBlock(goals) : [];

  function buildGoalsBlock(g) {
    const out = [];
    out.push(sectionHeading('Project Goals Assessment'));

    const ratingLabel = RATING_LABELS[g.overall_rating] || g.overall_rating || 'Unrated';
    out.push(
      new Paragraph({
        spacing: { after: SPACING_NORMAL_AFTER },
        children: [
          boldLabel('Overall Rating: '),
          bodyRun(ratingLabel, { bold: true }),
        ],
      }),
    );

    if (g.outcome_summary) {
      out.push(
        ...paragraphsFromText(g.outcome_summary),
      );
    }

    const goalArr = Array.isArray(g.goals) ? g.goals : [];
    goalArr.forEach((goal, idx) => {
      const number = goal.goal_number || `Goal ${idx + 1}`;
      out.push(
        new Paragraph({
          spacing: { before: SPACING_NORMAL_AFTER, after: SPACING_NORMAL_AFTER / 2 },
          children: [boldLabel(number)],
        }),
      );

      const goalTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              countCell('Goal', { bold: true, width: { size: 25, type: WidthType.PERCENTAGE } }),
              countCell(goal.goal_text || '—', { width: { size: 75, type: WidthType.PERCENTAGE } }),
            ],
          }),
          new TableRow({
            children: [
              countCell('Status', { bold: true, width: { size: 25, type: WidthType.PERCENTAGE } }),
              new TableCell({
                width: { size: 75, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    spacing: { after: 0 },
                    children: [bodyRun(STATUS_LABELS[goal.status] || goal.status || '—', { bold: true })],
                  }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              countCell('Evidence', { bold: true, width: { size: 25, type: WidthType.PERCENTAGE } }),
              countCell(goal.evidence_from_report || '—', { width: { size: 75, type: WidthType.PERCENTAGE } }),
            ],
          }),
        ],
      });
      out.push(goalTable);
    });

    if (g.notes_for_staff) {
      out.push(emptyLine(0));
      out.push(
        new Paragraph({
          spacing: { after: SPACING_NORMAL_AFTER },
          children: [
            boldLabel('Notes for Staff: '),
            bodyRun(g.notes_for_staff, { italics: true }),
          ],
        }),
      );
    }

    return out;
  }

  // ─── Assemble document ───────────────────────────────────────────────────

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: FONT_SIZE_BODY, font: FONT },
          paragraph: { spacing: { after: SPACING_NORMAL_AFTER, line: 276 } },
        },
      },
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
          size: {
            width: 12240,
            height: 15840,
          },
        },
      },
      children: [
        ...headerBlock,
        ...purposeBlock,
        ...abstractBlock,
        ...countsBlock,
        ...narrativesBlock,
        ...goalsBlock,
      ],
    }],
  });

  return Packer.toBlob(doc);
}
