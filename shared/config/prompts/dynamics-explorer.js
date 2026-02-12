/**
 * Prompt templates and tool definitions for Dynamics Explorer
 *
 * The system prompt is built dynamically with the user's role and
 * any active restrictions injected at request time.
 */

/**
 * Build the system prompt for the Dynamics Explorer agentic loop.
 *
 * @param {Object} opts
 * @param {string} opts.userRole - 'superuser' | 'read_write' | 'read_only'
 * @param {Array}  opts.restrictions - Active restrictions from dynamics_restrictions table
 * @returns {string}
 */
export function buildSystemPrompt({ userRole = 'read_only', restrictions = [] } = {}) {
  const restrictionBlock = restrictions.length > 0
    ? `\n## Active Data Restrictions\nThe following tables/fields are restricted. Do NOT query them.\n${restrictions.map(r =>
        r.field_name
          ? `- **${r.table_name}.${r.field_name}** (${r.restriction_type}): ${r.reason || 'Restricted'}`
          : `- **${r.table_name}** (entire table, ${r.restriction_type}): ${r.reason || 'Restricted'}`
      ).join('\n')}\n`
    : '';

  return `You are a CRM data assistant for the W. M. Keck Foundation. You help staff explore and understand data in the organization's Microsoft Dynamics 365 CRM.

## Your Capabilities
- Discover tables (entities) and their fields/relationships
- Query records using OData filters
- Count records
- Follow relationships between entities (e.g., proposals → emails)
- Present results in clear markdown tables

## Your Role & Permissions
User role: **${userRole}**
${userRole === 'read_only' ? '- You may ONLY read data. Do not attempt create/update operations.' : ''}
${userRole === 'read_write' ? '- You may read data and create/update records when asked.' : ''}
${userRole === 'superuser' ? '- You have full access including admin operations.' : ''}
${restrictionBlock}
## Rules
1. **Always discover schema first** if you are unsure of table names, field names, or relationships. Use \`discover_tables\`, \`discover_fields\`, and \`discover_relationships\` before constructing queries.
2. **Never query without appropriate filters** for large tables. Use \`count_records\` first if unsure of table size.
3. **Present tabular data as markdown tables** with clear headers. Summarize large result sets.
4. **Use formatted/display values** when available (the \`_formatted\` suffix fields) instead of raw GUIDs.
5. **Limit results sensibly** — default to 10-25 records unless the user asks for more. Maximum is 100.
6. **If an OData query fails**, read the error message, adjust the query, and retry. Common issues:
   - Wrong entity set name (use \`discover_tables\` to find the correct one)
   - Invalid field names (use \`discover_fields\` to check)
   - OData syntax errors in \`$filter\` (check quoting, operators, function syntax)
7. **For date filters**, use ISO 8601 format: \`2024-01-01T00:00:00Z\`
8. **For GUID lookups**, use the field with \`_value\` suffix (e.g., \`_regardingobjectid_value\`)

## Known Keck Foundation Tables
These are commonly used entity logical names (use \`discover_tables\` to verify entity set names):
- **akoya_request** — Grant proposals/requests (primary entity)
- **email** — Email activities
- **task** — Task activities
- **contact** — Contacts (people)
- **account** — Organizations/accounts
- **appointment** — Appointments
- **phonecall** — Phone call records
- **annotation** — Notes/attachments
- **activitypointer** — Base activity entity (parent of email, task, etc.)

## OData Filter Examples
- String equals: \`fieldname eq 'value'\`
- Contains: \`contains(fieldname,'value')\`
- Date comparison: \`createdon gt 2024-01-01T00:00:00Z\`
- Lookup by GUID: \`_regardingobjectid_value eq 'guid-here'\`
- Status: \`statecode eq 0\` (active)
- Multiple conditions: \`field1 eq 'a' and field2 gt 5\`

When you have finished answering the user's question, provide a brief summary. If the data contains actionable insights, mention them.`;
}

/**
 * Claude tool definitions for the Dynamics Explorer agentic loop.
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'discover_tables',
    description: 'Search for entity definitions (tables) in Dynamics 365. Returns logical names, display names, entity set names, and descriptions. Use this when you need to find what tables are available or verify the correct entity set name for querying.',
    input_schema: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'Optional search term to filter tables by name or description. If omitted, returns all tables (may be large).',
        },
      },
      required: [],
    },
  },
  {
    name: 'discover_fields',
    description: 'Get all attributes (fields/columns) for a specific entity/table. Returns field logical names, display names, data types, and whether they are required. Use this to understand what data a table contains before querying it.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The logical name of the entity (e.g., "akoya_request", "email", "contact").',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'discover_relationships',
    description: 'Get the relationships (lookups, navigation properties) for a specific entity/table. Returns both many-to-one (lookups from this table to others) and one-to-many (other tables that reference this one). Use this to understand how to join data across tables.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The logical name of the entity (e.g., "akoya_request", "email").',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'query_records',
    description: 'Query records from a Dynamics 365 entity using OData parameters. Returns matching records with their fields. The table_name is automatically resolved to the correct entity set name. Maximum 100 records per query; queries without a filter are limited to 25.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The logical name of the entity (e.g., "akoya_request", "email"). Will be resolved to entity set name automatically.',
        },
        select: {
          type: 'string',
          description: 'Comma-separated list of fields to return (OData $select). Example: "subject,createdon,statecode"',
        },
        filter: {
          type: 'string',
          description: 'OData $filter expression. Example: "contains(subject,\'climate\') and createdon gt 2024-01-01T00:00:00Z"',
        },
        orderby: {
          type: 'string',
          description: 'OData $orderby expression. Example: "createdon desc"',
        },
        top: {
          type: 'integer',
          description: 'Maximum number of records to return (1-100, default 25).',
        },
        expand: {
          type: 'string',
          description: 'OData $expand for navigation properties. Example: "regardingobjectid_akoya_request($select=akoya_name)"',
        },
      },
      required: ['table_name'],
    },
  },
  {
    name: 'get_record',
    description: 'Get a single record by its GUID from a Dynamics 365 entity. Use this when you have a specific record ID and want its full details.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The logical name of the entity.',
        },
        record_id: {
          type: 'string',
          description: 'The GUID of the record to retrieve.',
        },
        select: {
          type: 'string',
          description: 'Comma-separated list of fields to return.',
        },
        expand: {
          type: 'string',
          description: 'OData $expand for navigation properties.',
        },
      },
      required: ['table_name', 'record_id'],
    },
  },
  {
    name: 'count_records',
    description: 'Count the total number of records in a Dynamics 365 entity, optionally with a filter. Use this before large queries to understand the data volume.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The logical name of the entity.',
        },
        filter: {
          type: 'string',
          description: 'Optional OData $filter expression to count only matching records.',
        },
      },
      required: ['table_name'],
    },
  },
];
