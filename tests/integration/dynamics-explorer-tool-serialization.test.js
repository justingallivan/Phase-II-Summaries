import {
  clearAppAccessCache,
  createMockReq,
  createMockRes,
  mockAuthenticatedUser,
} from '../helpers/auth-mock';

const mockStream = jest.fn();
const mockQueryRecords = jest.fn();
const mockResolveEntitySetName = jest.fn();

jest.mock('../../shared/api/middleware/rateLimiter', () => ({
  nextRateLimiter: () => jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../../lib/services/model-override-loader', () => ({
  loadModelOverrides: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../shared/config/baseConfig', () => ({
  BASE_CONFIG: {
    ERROR_MESSAGES: {
      QUERY_FAILED: 'Query failed',
    },
  },
  getModelForApp: jest.fn(() => 'claude-test'),
  getFallbackModelForApp: jest.fn(() => 'claude-fallback-test'),
}));

jest.mock('../../shared/config/prompts/dynamics-explorer', () => ({
  buildSystemPrompt: jest.fn(() => 'system prompt'),
  TOOL_DEFINITIONS: [{ name: 'query_records' }],
  TABLE_ANNOTATIONS: {},
}));

jest.mock('../../lib/services/dynamics-service', () => ({
  DynamicsService: {
    resolveEntitySetName: (...args) => mockResolveEntitySetName(...args),
    queryRecords: (...args) => mockQueryRecords(...args),
  },
}));

jest.mock('../../lib/services/dynamics-context', () => ({
  withDynamicsContext: jest.fn((ctx, fn) => fn()),
}));

jest.mock('../../lib/services/graph-service', () => ({
  GraphService: {},
}));

jest.mock('../../lib/utils/sharepoint-buckets', () => ({
  getRequestSharePointBuckets: jest.fn(),
}));

jest.mock('../../lib/services/llm-client', () => ({
  LLMClient: jest.fn().mockImplementation(() => ({
    stream: (...args) => mockStream(...args),
  })),
}));

jest.mock('exceljs', () => ({}));

describe('/api/dynamics-explorer/chat tool-result serialization', () => {
  let handler;

  beforeAll(async () => {
    handler = (await import('../../pages/api/dynamics-explorer/chat')).default;
  });

  beforeEach(() => {
    clearAppAccessCache();
    jest.clearAllMocks();
    process.env.CLAUDE_API_KEY = 'test-key';

    mockAuthenticatedUser(9, ['dynamics-explorer']);
    mockResolveEntitySetName.mockResolvedValue('akoya_requests');
    mockQueryRecords.mockResolvedValue({
      records: [
        {
          akoya_requestnum: 'REQ-123',
          description: 'FULL EMAIL OR MEMO BODY SHOULD NOT REACH CLAUDE',
          wmkf_abstract: `${'A'.repeat(1600)}UNSENT_TAIL`,
          normal_field: 'safe value',
        },
      ],
      count: 1,
      totalCount: 1,
    });

    mockStream
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'query_records',
            input: {
              table_name: 'akoya_requests',
              select: 'akoya_requestnum,description,wmkf_abstract,normal_field',
              top: 1,
            },
          },
        ],
        model: 'claude-test',
        usage: {},
        textStreamed: false,
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Done.' }],
        model: 'claude-test',
        usage: {},
        textStreamed: false,
      });
  });

  afterEach(() => {
    delete process.env.CLAUDE_API_KEY;
  });

  test('redacts sensitive fields and long tails before appending tool_result messages', async () => {
    const req = createMockReq({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'show requests' }] },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(mockStream).toHaveBeenCalledTimes(2);
    const secondCall = mockStream.mock.calls[1][0];
    const toolResultMessage = secondCall.messages.find(
      m => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    const toolResult = toolResultMessage.content[0].content;

    expect(toolResult).toContain('REQ-123');
    expect(toolResult).toContain('safe value');
    expect(toolResult).toContain('_aiContextBoundary');
    expect(toolResult).not.toContain('FULL EMAIL OR MEMO BODY');
    expect(toolResult).not.toContain('UNSENT_TAIL');
  });
});
