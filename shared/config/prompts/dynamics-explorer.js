/**
 * Prompt templates and tool definitions for Dynamics Explorer
 *
 * Optimized for low token usage — entity set names are hardcoded so
 * Claude can query directly without discovery rounds. Null fields are
 * stripped server-side so results stay compact.
 */

/**
 * Build the system prompt for the Dynamics Explorer agentic loop.
 */
export function buildSystemPrompt({ userRole = 'read_only', restrictions = [] } = {}) {
  const restrictionBlock = restrictions.length > 0
    ? `\nRESTRICTED: ${restrictions.map(r =>
        r.field_name ? `${r.table_name}.${r.field_name}` : `${r.table_name}`
      ).join(', ')}\n`
    : '';

  return `CRM assistant for W. M. Keck Foundation Dynamics 365. Role: ${userRole}.
${restrictionBlock}
Tables (logical → entity set): akoya_request→akoya_requests, email→emails, task→tasks, contact→contacts, account→accounts, appointment→appointments, phonecall→phonecalls, annotation→annotations, activitypointer→activitypointers.

Query directly using query_records or count_records — do NOT call discover_fields/discover_tables first unless the user asks about an unknown table. Null/empty fields are stripped from results automatically, so you will only see populated fields.

Use $select for specific fields, $top default 10. Present results as markdown tables. Prefer _formatted values over GUIDs.
OData filters: eq, contains(), gt/lt. Dates: 2024-01-01T00:00:00Z. Lookups: _fieldid_value.
If a query fails, read the error and adjust.`;
}

/**
 * Claude tool definitions — minimal to reduce token overhead.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'query_records',
    description: 'Query records. table_name resolves automatically. Null fields stripped from results.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        select: { type: 'string', description: 'Comma-separated fields' },
        filter: { type: 'string', description: 'OData $filter' },
        orderby: { type: 'string', description: 'OData $orderby' },
        top: { type: 'integer', description: '1-100, default 10' },
        expand: { type: 'string', description: 'OData $expand' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'count_records',
    description: 'Count records, optionally filtered.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filter: { type: 'string', description: 'OData $filter' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'get_record',
    description: 'Get one record by GUID.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        record_id: { type: 'string' },
        select: { type: 'string' },
        expand: { type: 'string' },
      },
      required: ['table_name', 'record_id'],
    },
  },
  {
    name: 'discover_tables',
    description: 'Search for tables by name. Only use when the user asks about unknown tables.',
    input_schema: {
      type: 'object',
      properties: {
        search_term: { type: 'string', description: 'Required search term' },
      },
      required: ['search_term'],
    },
  },
  {
    name: 'discover_fields',
    description: 'List fields for a table. Only use when the user explicitly asks what fields exist.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
      },
      required: ['table_name'],
    },
  },
];
