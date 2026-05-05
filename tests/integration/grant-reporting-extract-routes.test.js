/**
 * Handler-level AI payload boundary test for /api/grant-reporting/extract.
 *
 * The unit suite (`tests/unit/grant-reporting-extract-payload-boundary.test.js`)
 * covers the two exported pure helpers (`extractReport`,
 * `compareProposalToReport`). The third call site —
 * `handleRegenerate(mode='regenerate')` — lives only inside the route handler
 * and is not exported. This test drives the handler directly with a long
 * report payload to prove `grant-reporting.regenerate.reportText` is bounded
 * before `createFieldRegenerationPrompt` runs.
 */

import {
  mockAuthenticatedUser,
  createMockReq,
  createMockRes,
  clearAppAccessCache,
} from '../helpers/auth-mock';
import { GRANT_REPORTING_REPORT_MAX_CHARS } from '../../lib/utils/ai-payload-boundary';

// Rate limiter — always allow through.
jest.mock('../../shared/api/middleware/rateLimiter', () => ({
  nextRateLimiter: () => jest.fn(() => Promise.resolve(true)),
}));

// Model override loader — no-op.
jest.mock('../../lib/services/model-override-loader', () => ({
  loadModelOverrides: jest.fn(() => Promise.resolve()),
  clearModelOverridesCache: jest.fn(),
}));

// Base config — minimal, just what the route reads.
jest.mock('../../shared/config/baseConfig', () => ({
  BASE_CONFIG: {
    ERROR_MESSAGES: { PROCESSING_FAILED: 'Processing failed' },
  },
  getModelForApp: jest.fn(() => 'claude-test'),
  getFallbackModelForApp: jest.fn(() => null),
  loadModelOverrides: jest.fn(() => Promise.resolve()),
}));

// Usage logger — silent.
jest.mock('../../lib/utils/usage-logger', () => ({
  logUsage: jest.fn(),
  estimateCostCents: jest.fn(() => 0),
}));

// Dynamics writeback — silent (handleRegenerate calls tryLogAiRun → DynamicsService.logAiRun).
jest.mock('../../lib/services/dynamics-service', () => ({
  DynamicsService: { logAiRun: jest.fn(() => Promise.resolve()) },
}));

// File loader — return whatever the test preloaded.
let mockedReportText = '';
jest.mock('../../lib/utils/file-loader', () => ({
  loadFile: jest.fn(async () => ({ text: mockedReportText, filename: 'report.pdf' })),
  httpError: jest.fn((res, status, msg) => res.status(status).json({ error: msg })),
}));

// LLMClient — capture the prompt string sent for `mode: 'regenerate'`.
const sentPrompts = [];
jest.mock('../../lib/services/llm-client', () => ({
  LLMClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn(async ({ messages }) => {
      sentPrompts.push(messages?.[0]?.content ?? '');
      return {
        text: '{"value":"regenerated narrative"}',
        model: 'claude-test',
        usage: { input_tokens: 100, output_tokens: 50 },
      };
    }),
  })),
}));

beforeEach(() => {
  sentPrompts.length = 0;
  clearAppAccessCache();
  process.env.CLAUDE_API_KEY = 'sk-ant-test';
});

describe('/api/grant-reporting/extract handler — regenerate boundary', () => {
  test('caps reportText under GRANT_REPORTING_REPORT_MAX_CHARS for handleRegenerate', async () => {
    mockedReportText = `${'R'.repeat(GRANT_REPORTING_REPORT_MAX_CHARS + 500)}UNSENT_TAIL`;
    mockAuthenticatedUser(2, ['grant-reporting']);

    // Import after mocks are wired
    const handler = (await import('../../pages/api/grant-reporting/extract')).default;

    const req = createMockReq({
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000' },
      body: {
        mode: 'regenerate',
        reportRef: { source: 'upload', fileUrl: 'https://test.public.blob.vercel-storage.com/r.pdf', filename: 'r.pdf' },
        fieldKey: 'project_impacts',
        currentValues: { narratives: {} },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    expect(sentPrompts.length).toBe(1);
    expect(sentPrompts[0]).toContain('AI payload boundary: grant-reporting.regenerate.reportText');
    expect(sentPrompts[0]).not.toContain('UNSENT_TAIL');
    // Sanity — handler reaches a successful response, not an early auth/validation error.
    expect(res.statusCode).toBe(200);
  });
});
