import {
  serializeDynamicsExplorerFieldValueForModel,
  serializeDynamicsExplorerRecordForModel,
  serializeDynamicsExplorerToolResult,
} from '../../lib/utils/dynamics-explorer-serializer';

describe('dynamics explorer AI-context serializer', () => {
  test('redacts high-risk CRM fields recursively before tool results reach model context', () => {
    const result = serializeDynamicsExplorerToolResult({
      records: [
        {
          akoya_requestnum: 'REQ-1',
          description: 'Sensitive email body that should not ride along as a generic CRM field.',
          nested: {
            notetext: 'Private note',
            normalField: 'kept',
          },
          '@odata.etag': 'ignored',
        },
      ],
      totalCount: 1,
    }, { toolName: 'query_records' });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('REQ-1');
    expect(serialized).toContain('normalField');
    expect(serialized).not.toContain('Sensitive email body');
    expect(serialized).not.toContain('Private note');
    expect(serialized).not.toContain('@odata.etag');
    expect(result._aiContextBoundary.redactedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'records[0].description', field: 'description' }),
      expect.objectContaining({ path: 'records[0].nested.notetext', field: 'notetext' }),
    ]));
  });

  test('caps long scalar values while preserving a short preview', () => {
    const longValue = `${'A'.repeat(40)}UNSENT_TAIL`;
    const result = serializeDynamicsExplorerToolResult({
      records: [{ name: 'Example', wmkf_abstract: longValue }],
    }, { toolName: 'query_records', maxStringChars: 40 });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('AAAAAAAAAA');
    expect(serialized).not.toContain('UNSENT_TAIL');
    expect(result._aiContextBoundary.truncatedFields).toEqual([
      expect.objectContaining({
        path: 'records[0].wmkf_abstract',
        originalChars: longValue.length,
      }),
    ]);
  });

  test('passes describe_table through so schema descriptions are not mistaken for CRM memo fields', () => {
    const result = serializeDynamicsExplorerToolResult({
      table: 'akoya_requests',
      description: 'Useful schema description',
    }, { toolName: 'describe_table' });

    expect(result.description).toBe('Useful schema description');
    expect(result._aiContextBoundary).toBeUndefined();
  });

  test('record serializer uses the same redaction policy for export AI processing', () => {
    const result = serializeDynamicsExplorerRecordForModel({
      name: 'Record',
      api_secret: 'secret-value',
      notes: 'ordinary notes',
    });

    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(result.notes).toBe('ordinary notes');
  });

  test('field serializer covers preformatted search highlights', () => {
    const redacted = serializeDynamicsExplorerFieldValueForModel(
      'description',
      'Matched narrative highlight',
    );
    expect(redacted).not.toContain('Matched narrative');

    const truncated = serializeDynamicsExplorerFieldValueForModel(
      'akoya_title',
      `${'T'.repeat(20)}UNSENT_TAIL`,
      { maxStringChars: 20 },
    );
    expect(truncated).toContain('TTTTT');
    expect(truncated).not.toContain('UNSENT_TAIL');
  });

  test('redacts token-like fields even when values are already hashed', () => {
    const result = serializeDynamicsExplorerRecordForModel({
      wmkf_name: 'Reviewer',
      wmkf_externaltoken: 'hashed-token-value',
      wmkf_externaltokenrevoked: false,
    });

    expect(JSON.stringify(result)).not.toContain('hashed-token-value');
    expect(result.wmkf_externaltoken).toContain('[redacted for AI context');
  });
});
