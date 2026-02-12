/**
 * Prompt templates and tool definitions for Dynamics Explorer
 *
 * Optimized for low token usage — the system prompt and tool definitions
 * are kept minimal to stay within tight rate limits.
 */

/**
 * Build the system prompt for the Dynamics Explorer agentic loop.
 */
export function buildSystemPrompt({ userRole = 'read_only', restrictions = [] } = {}) {
  const restrictionBlock = restrictions.length > 0
    ? `\nRESTRICTED (do NOT query): ${restrictions.map(r =>
        r.field_name ? `${r.table_name}.${r.field_name}` : `${r.table_name} (whole table)`
      ).join(', ')}\n`
    : '';

  return `You are a CRM assistant for the W. M. Keck Foundation's Dynamics 365.
Role: ${userRole}. ${userRole === 'read_only' ? 'Read-only access.' : ''}
${restrictionBlock}
Key tables: akoya_request (proposals), email, task, contact, account, appointment, phonecall, annotation, activitypointer.

Rules:
- Discover schema before querying if unsure of names. Use $select to request only needed fields.
- Use count_records before querying large tables. Default $top=10.
- Present results as markdown tables. Use _formatted suffix values over GUIDs.
- OData: eq, contains(), gt/lt, and/or. Dates: 2024-01-01T00:00:00Z. GUIDs: _fieldid_value.
- If a query fails, read the error and retry with corrections.`;
}

/**
 * Claude tool definitions — kept minimal to reduce token usage.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'discover_tables',
    description: 'List available tables. Use search_term to filter.',
    input_schema: {
      type: 'object',
      properties: {
        search_term: { type: 'string', description: 'Filter by name/description' },
      },
    },
  },
  {
    name: 'discover_fields',
    description: 'Get fields for a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Entity logical name' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'discover_relationships',
    description: 'Get lookup/navigation relationships for a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Entity logical name' },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'query_records',
    description: 'Query records with OData. table_name auto-resolves to entity set. Max 100, default 10.',
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
    name: 'get_record',
    description: 'Get one record by GUID.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        record_id: { type: 'string', description: 'Record GUID' },
        select: { type: 'string' },
        expand: { type: 'string' },
      },
      required: ['table_name', 'record_id'],
    },
  },
  {
    name: 'count_records',
    description: 'Count records, optionally with a filter.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filter: { type: 'string', description: 'OData $filter' },
      },
      required: ['table_name'],
    },
  },
];
