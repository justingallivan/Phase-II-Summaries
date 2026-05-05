const DEFAULT_MAX_STRING_CHARS = 1500;

// Substring patterns are intentionally permissive — Dynamics field naming
// uses table prefixes (wmkf_, akoya_, _*_value) so accidental matches against
// unrelated fields are vanishingly rare. Notable intentional captures:
//   /token/i   — catches wmkf_externaltoken / wmkf_externaltokenrevoked on
//                wmkf_potentialreviewer. Those values are already hashed, but
//                they have no business in the agent loop either way.
//   /session/i — any future session-id columns.
// Exact-match patterns (^description$, ^body$, ^notetext$) avoid catching
// legitimate sibling fields like description_internal.
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api[_-]?key/i,
  /credential/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /documentbody/i,
  /rawoutput/i,
  /promptoverride/i,
  /^description$/i,
  /^notetext$/i,
  /^body$/i,
];

const PASSTHROUGH_TOOLS = new Set([
  'describe_table',
  'count_records',
  'list_documents',
  'search_documents',
]);

function shouldRedactField(fieldName) {
  const normalized = fieldName.replace(/_formatted$/i, '');
  return SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(normalized));
}

function redactedFieldValue(fieldName, value) {
  if (typeof value === 'string') {
    return `[redacted for AI context: field=${fieldName}, originalChars=${value.length}]`;
  }
  return `[redacted for AI context: field=${fieldName}]`;
}

function truncateStringForModel(value, maxStringChars) {
  if (value.length <= maxStringChars) return value;
  return `${value.slice(0, maxStringChars)}\n[truncated for AI context: originalChars=${value.length}]`;
}

function sanitizeValue(value, path, meta, maxStringChars) {
  if (Array.isArray(value)) {
    return value.map((item, idx) => sanitizeValue(item, `${path}[${idx}]`, meta, maxStringChars));
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      const truncated = truncateStringForModel(value, maxStringChars);
      if (truncated !== value) {
        meta.truncatedFields.push({ path, originalChars: value.length, transmittedChars: truncated.length });
      }
      return truncated;
    }
    return value;
  }

  const cleaned = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('@') || key.includes('odata')) continue;

    const childPath = path ? `${path}.${key}` : key;
    if (shouldRedactField(key)) {
      cleaned[key] = redactedFieldValue(key, child);
      meta.redactedFields.push({
        path: childPath,
        field: key,
        originalChars: typeof child === 'string' ? child.length : undefined,
      });
      continue;
    }

    cleaned[key] = sanitizeValue(child, childPath, meta, maxStringChars);
  }
  return cleaned;
}

function hasBoundaryMetadata(meta) {
  return meta.redactedFields.length > 0 || meta.truncatedFields.length > 0;
}

export function serializeDynamicsExplorerToolResult(result, { toolName, maxStringChars = DEFAULT_MAX_STRING_CHARS } = {}) {
  if (PASSTHROUGH_TOOLS.has(toolName)) {
    return result;
  }

  const meta = { redactedFields: [], truncatedFields: [] };
  const sanitized = sanitizeValue(result, '', meta, maxStringChars);

  if (!hasBoundaryMetadata(meta) || !sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return sanitized;
  }

  return {
    ...sanitized,
    _aiContextBoundary: {
      redactedFields: meta.redactedFields.map(({ path, field, originalChars }) => ({
        path,
        field,
        ...(originalChars !== undefined ? { originalChars } : {}),
      })),
      truncatedFields: meta.truncatedFields,
    },
  };
}

export function serializeDynamicsExplorerRecordForModel(record, options = {}) {
  return serializeDynamicsExplorerToolResult(record, { toolName: 'export_csv', ...options });
}

export function serializeDynamicsExplorerFieldValueForModel(fieldName, value, { maxStringChars = DEFAULT_MAX_STRING_CHARS } = {}) {
  if (shouldRedactField(fieldName)) {
    return redactedFieldValue(fieldName, value);
  }
  if (typeof value === 'string') {
    return truncateStringForModel(value, maxStringChars);
  }
  return value;
}
