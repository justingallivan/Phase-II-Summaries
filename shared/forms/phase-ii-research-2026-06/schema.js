/**
 * Phase II Research — mid-June 2026 cycle
 *
 * First-pass field inventory. Sarah and Connor will refine this; treat
 * the current state as "concrete enough to react to," not as final.
 *
 * Design principles (see docs/INTAKE_PORTAL_DESIGN.md):
 *   - Machine-legible capture wherever possible. Budgets, rosters,
 *     milestones go in structured tables, NOT narrative or XLSX.
 *   - Once shipped, this schema is frozen. The next cycle gets a new
 *     directory + new form_key.
 *   - This file is the single source of truth — Form.js, validate.js,
 *     and map-to-dynamics.js all consume it. Don't duplicate field
 *     definitions in those files.
 *
 * Field type vocabulary:
 *   text         single-line string
 *   longtext     multi-line narrative; honors `maxChars` (NOT word count;
 *                word count is hard to enforce server-side and easy to
 *                game with whitespace)
 *   number       integer or decimal; `precision` controls decimals
 *   date         ISO date (no time)
 *   choice       single select from `options`
 *   bool         checkbox
 *   file         attachment; `accept` lists MIME types, `maxSizeMb` per file
 *   table        repeating rows; `columns` defines the row shape
 *
 * Required vs. optional follows the obvious flag. Conditional requirements
 * (e.g., "EIN required if US-based") are NOT supported in pilot — keep
 * the form linear.
 */

const FORM_KEY = 'phase-ii-research-2026-06';

const ATTACHMENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const sections = [
  {
    key: 'project',
    title: 'Project',
    fields: [
      {
        key: 'project_title',
        type: 'text',
        label: 'Project title',
        required: true,
        maxChars: 250,
        helpText: 'Pre-filled from your Phase I submission. Edit only with program director approval.',
      },
      {
        key: 'project_abstract',
        type: 'longtext',
        label: 'Project abstract',
        required: true,
        maxChars: 3000,
        helpText: 'Suitable for sharing with reviewers. ~400 words.',
      },
      {
        key: 'project_start_date',
        type: 'date',
        label: 'Proposed project start date',
        required: true,
      },
      {
        key: 'project_duration_months',
        type: 'number',
        label: 'Project duration (months)',
        required: true,
        min: 12,
        max: 60,
        precision: 0,
      },
    ],
  },

  {
    key: 'narrative',
    title: 'Project narrative',
    fields: [
      {
        key: 'specific_aims',
        type: 'longtext',
        label: 'Specific aims',
        required: true,
        maxChars: 6000,
      },
      {
        key: 'significance',
        type: 'longtext',
        label: 'Significance',
        required: true,
        maxChars: 6000,
      },
      {
        key: 'innovation',
        type: 'longtext',
        label: 'Innovation',
        required: true,
        maxChars: 6000,
      },
      {
        key: 'approach',
        type: 'longtext',
        label: 'Approach',
        required: true,
        maxChars: 12000,
        helpText: 'Methods, preliminary data, design, analysis plan.',
      },
      {
        key: 'risks_alternatives',
        type: 'longtext',
        label: 'Potential risks and alternative strategies',
        required: true,
        maxChars: 4000,
      },
      {
        key: 'broader_impact',
        type: 'longtext',
        label: 'Broader impact / training and outreach',
        required: false,
        maxChars: 4000,
      },
    ],
  },

  {
    key: 'personnel',
    title: 'Personnel',
    fields: [
      {
        key: 'pi_name',
        type: 'text',
        label: 'Principal Investigator name',
        required: true,
        helpText: 'Pre-filled from your Phase I submission. Edit only with program director approval.',
      },
      {
        key: 'pi_email',
        type: 'text',
        label: 'PI email',
        required: true,
      },
      {
        key: 'pi_orcid',
        type: 'text',
        label: 'PI ORCID',
        required: false,
        helpText: 'Format: 0000-0000-0000-0000',
      },
      {
        key: 'co_investigators',
        type: 'table',
        label: 'Co-Investigators and key personnel',
        required: false,
        helpText: 'Anyone with >= 5% effort. Senior personnel only — graduate students and postdocs do not need rows.',
        columns: [
          { key: 'name', type: 'text', label: 'Name', required: true },
          { key: 'affiliation', type: 'text', label: 'Affiliation', required: true },
          { key: 'role', type: 'text', label: 'Role on project', required: true },
          { key: 'percent_effort', type: 'number', label: '% effort', required: true, min: 0, max: 100, precision: 0 },
          { key: 'orcid', type: 'text', label: 'ORCID', required: false },
        ],
        minRows: 0,
        maxRows: 20,
      },
    ],
  },

  {
    key: 'budget',
    title: 'Budget',
    fields: [
      {
        key: 'total_request_usd',
        type: 'number',
        label: 'Total amount requested (USD)',
        required: true,
        min: 0,
        precision: 0,
        helpText: 'Direct + indirect, all years combined.',
      },
      {
        key: 'budget_lines',
        type: 'table',
        label: 'Budget by year and category',
        required: true,
        helpText: 'One row per (year, category) combination. Indirect costs go in the IDC row, not folded into other categories.',
        columns: [
          { key: 'year', type: 'number', label: 'Project year', required: true, min: 1, max: 5, precision: 0 },
          {
            key: 'category',
            type: 'choice',
            label: 'Category',
            required: true,
            options: [
              { value: 'personnel_salary', label: 'Personnel — salary' },
              { value: 'personnel_fringe', label: 'Personnel — fringe' },
              { value: 'equipment', label: 'Equipment' },
              { value: 'supplies', label: 'Supplies' },
              { value: 'travel', label: 'Travel' },
              { value: 'publication', label: 'Publication / dissemination' },
              { value: 'subaward', label: 'Subaward' },
              { value: 'other_direct', label: 'Other direct' },
              { value: 'indirect', label: 'Indirect (IDC)' },
            ],
          },
          { key: 'amount_usd', type: 'number', label: 'Amount (USD)', required: true, min: 0, precision: 0 },
          { key: 'note', type: 'text', label: 'Note', required: false },
        ],
        minRows: 1,
        maxRows: 100,
      },
      {
        key: 'budget_justification_attachment',
        type: 'file',
        label: 'Budget justification (PDF or DOCX)',
        required: true,
        accept: [ATTACHMENT_TYPES.pdf, ATTACHMENT_TYPES.docx],
        maxSizeMb: 10,
      },
    ],
  },

  {
    key: 'timeline',
    title: 'Timeline & milestones',
    fields: [
      {
        key: 'milestones',
        type: 'table',
        label: 'Milestones and deliverables',
        required: true,
        helpText: 'Quarterly granularity is fine; do not list every internal step.',
        columns: [
          { key: 'target_date', type: 'date', label: 'Target date', required: true },
          { key: 'deliverable', type: 'text', label: 'Deliverable', required: true },
          { key: 'success_metric', type: 'text', label: 'Success metric', required: false },
        ],
        minRows: 1,
        maxRows: 50,
      },
    ],
  },

  {
    key: 'prior_support',
    title: 'Other support',
    fields: [
      {
        key: 'prior_support_rows',
        type: 'table',
        label: 'Active and pending support (PI + Co-Is)',
        required: false,
        helpText: 'All federal, foundation, and industry support, active or under review. Do not list completed grants.',
        columns: [
          { key: 'person', type: 'text', label: 'Person', required: true },
          { key: 'funder', type: 'text', label: 'Funder', required: true },
          { key: 'project_title', type: 'text', label: 'Project title', required: true },
          {
            key: 'status',
            type: 'choice',
            label: 'Status',
            required: true,
            options: [
              { value: 'active', label: 'Active' },
              { value: 'pending', label: 'Pending' },
            ],
          },
          { key: 'start_date', type: 'date', label: 'Start date', required: true },
          { key: 'end_date', type: 'date', label: 'End date', required: true },
          { key: 'total_amount_usd', type: 'number', label: 'Total award (USD)', required: true, min: 0, precision: 0 },
          { key: 'percent_effort', type: 'number', label: 'Person % effort', required: true, min: 0, max: 100, precision: 0 },
          { key: 'overlap_note', type: 'text', label: 'Overlap with this proposal (if any)', required: false },
        ],
        minRows: 0,
        maxRows: 50,
      },
    ],
  },

  {
    key: 'attachments',
    title: 'Attachments',
    fields: [
      {
        key: 'pi_biosketch',
        type: 'file',
        label: 'PI biosketch (PDF, NIH or NSF format)',
        required: true,
        accept: [ATTACHMENT_TYPES.pdf],
        maxSizeMb: 10,
      },
      {
        key: 'co_investigator_biosketches',
        type: 'file',
        label: 'Co-Investigator biosketches (PDF, one file per Co-I)',
        required: false,
        accept: [ATTACHMENT_TYPES.pdf],
        maxSizeMb: 10,
        multiple: true,
        maxFiles: 15,
      },
      {
        key: 'letters_of_support',
        type: 'file',
        label: 'Letters of support (PDF, optional)',
        required: false,
        accept: [ATTACHMENT_TYPES.pdf],
        maxSizeMb: 10,
        multiple: true,
        maxFiles: 10,
      },
      {
        key: 'facilities_resources',
        type: 'file',
        label: 'Facilities and resources statement (PDF)',
        required: true,
        accept: [ATTACHMENT_TYPES.pdf],
        maxSizeMb: 10,
      },
      {
        key: 'data_management_plan',
        type: 'file',
        label: 'Data management plan (PDF, optional)',
        required: false,
        accept: [ATTACHMENT_TYPES.pdf],
        maxSizeMb: 10,
      },
    ],
  },

  {
    key: 'compliance',
    title: 'Compliance',
    fields: [
      {
        key: 'human_subjects',
        type: 'bool',
        label: 'Project involves human subjects',
        required: false,
      },
      {
        key: 'vertebrate_animals',
        type: 'bool',
        label: 'Project involves vertebrate animals',
        required: false,
      },
      {
        key: 'biohazards',
        type: 'bool',
        label: 'Project involves recombinant DNA, select agents, or other biohazards',
        required: false,
      },
      {
        key: 'compliance_note',
        type: 'longtext',
        label: 'Compliance notes (only if any of the above apply)',
        required: false,
        maxChars: 2000,
        helpText: 'IRB / IACUC / IBC status, approval numbers, or expected approval timeline.',
      },
    ],
  },
];

const schema = {
  formKey: FORM_KEY,
  cycle: 'Phase II Research — June 2026',
  status: 'draft',
  /** When `true`, validation runs but submission is blocked. Used during
   *  Sarah/Connor review of the inventory. Flip to false before pilot. */
  previewOnly: true,
  sections,
};

module.exports = schema;
module.exports.FORM_KEY = FORM_KEY;
module.exports.ATTACHMENT_TYPES = ATTACHMENT_TYPES;
