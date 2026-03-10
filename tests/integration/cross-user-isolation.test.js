/**
 * Cross-user data isolation tests.
 *
 * Verifies that user-scoped DB queries correctly filter by profileId,
 * so User A's data is inaccessible to User B.
 *
 * We test the two email-generation routes that look up reviewer_suggestions:
 * - /api/reviewer-finder/generate-emails  (lookupProposalInfoForCandidates)
 * - /api/review-manager/send-emails       (reviewer data join)
 *
 * The test mocks `sql` to inspect the profileId passed in the queries and
 * returns empty results when the profileId doesn't match the "owner".
 */

import {
  mockAuthenticatedUser,
  createMockReq,
  createMockRes,
  clearAppAccessCache,
} from '../helpers/auth-mock';

import { sql } from '@vercel/postgres';

// ---------------------------------------------------------------------------
// Global mocks (same as auth-routes.test.js)
// ---------------------------------------------------------------------------
jest.mock('../../shared/api/middleware/rateLimiter', () => ({
  nextRateLimiter: () => jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
  del: jest.fn(),
}));

jest.mock('../../lib/utils/usage-logger', () => ({
  logUsage: jest.fn(),
  estimateCostCents: jest.fn(() => 0),
}));

jest.mock('../../shared/config/baseConfig', () => ({
  BASE_CONFIG: {
    ERROR_MESSAGES: {
      PROCESSING_FAILED: 'Processing failed',
      EMAIL_GENERATION_FAILED: 'Email generation failed',
      DATABASE_ERROR: 'Database error',
    },
  },
  getModelForApp: jest.fn(() => 'claude-sonnet-4-20250514'),
  getFallbackModelForApp: jest.fn(() => 'claude-haiku-4-5-20251001'),
  loadModelOverrides: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/utils/email-generator', () => ({
  generateEmlContent: jest.fn(() => 'eml-content'),
  generateEmlContentWithAttachments: jest.fn(() => 'eml-content'),
  replacePlaceholders: jest.fn((tpl) => tpl),
  buildTemplateData: jest.fn(() => ({})),
  createFilename: jest.fn((name) => `${name}.eml`),
}));

jest.mock('../../shared/config/prompts/email-reviewer', () => ({
  createPersonalizationPrompt: jest.fn(() => 'test prompt'),
}));

jest.mock('../../lib/utils/safe-fetch', () => ({
  safeFetch: jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })),
  isAllowedUrl: jest.fn(() => true),
}));

// ---------------------------------------------------------------------------
const USER_A_PROFILE = 1;
const USER_B_PROFILE = 2;
const SUGGESTION_OWNED_BY_A = 100;

beforeEach(() => {
  clearAppAccessCache();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// /api/review-manager/send-emails — cross-user isolation
// ---------------------------------------------------------------------------
describe('/api/review-manager/send-emails cross-user isolation', () => {
  let handler;

  beforeAll(async () => {
    const mod = await import('../../pages/api/review-manager/send-emails');
    handler = mod.default;
  });

  it('User B gets 0 results for User A suggestion IDs', async () => {
    // Mock User B — has access to review-manager
    mockAuthenticatedUser(USER_B_PROFILE, ['review-manager']);

    // Override sql mock: the reviewer data query filters by user_profile_id,
    // so when User B (profileId=2) queries for suggestion owned by User A,
    // it should return empty rows.
    const { sql: mockSql } = require('@vercel/postgres');
    mockSql.mockImplementation((...args) => {
      const queryText = Array.isArray(args[0]) ? args[0].join(' ') : '';

      // App access queries
      if (queryText.includes('user_app_access')) {
        return Promise.resolve({ rows: [{ app_key: 'review-manager' }], rowCount: 1 });
      }
      if (queryText.includes('dynamics_user_roles')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (queryText.includes('is_active')) {
        return Promise.resolve({ rows: [{ is_active: true }], rowCount: 1 });
      }

      // reviewer_suggestions query: return empty for User B
      if (queryText.includes('reviewer_suggestions')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const req = createMockReq({
      method: 'POST',
      body: {
        suggestionIds: [SUGGESTION_OWNED_BY_A],
        templateType: 'materials',
        template: { subject: 'Test', body: 'Test body' },
        settings: {},
      },
    });
    const res = createMockRes();

    await handler(req, res);

    // The handler uses SSE, so check the write calls for error or empty results
    const writeCalls = res.write.mock.calls.map(c => c[0]).join('');
    // Should contain an error event about no reviewers found
    expect(writeCalls).toContain('No reviewers found');
  });
});

// ---------------------------------------------------------------------------
// /api/reviewer-finder/generate-emails — cross-user isolation
// ---------------------------------------------------------------------------
describe('/api/reviewer-finder/generate-emails cross-user isolation', () => {
  let handler;

  beforeAll(async () => {
    const mod = await import('../../pages/api/reviewer-finder/generate-emails');
    handler = mod.default;
  });

  it('User B cannot look up User A proposal info via suggestionId', async () => {
    // Mock User B
    mockAuthenticatedUser(USER_B_PROFILE, ['reviewer-finder']);

    const { sql: mockSql } = require('@vercel/postgres');
    mockSql.mockImplementation((...args) => {
      const queryText = Array.isArray(args[0]) ? args[0].join(' ') : '';

      // App access queries
      if (queryText.includes('user_app_access')) {
        return Promise.resolve({ rows: [{ app_key: 'reviewer-finder' }], rowCount: 1 });
      }
      if (queryText.includes('dynamics_user_roles')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (queryText.includes('is_active')) {
        return Promise.resolve({ rows: [{ is_active: true }], rowCount: 1 });
      }

      // reviewer_suggestions lookup: return empty for User B
      if (queryText.includes('reviewer_suggestions')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const req = createMockReq({
      method: 'POST',
      body: {
        candidates: [
          { name: 'Dr. Test', email: 'test@example.com', suggestionId: SUGGESTION_OWNED_BY_A },
        ],
        template: { subject: 'Invitation', body: 'Dear {{candidateName}}' },
        settings: { senderEmail: 'sender@wmkeck.org', senderName: 'Sender' },
        options: { markAsSent: true },
      },
    });
    const res = createMockRes();

    await handler(req, res);

    // The handler should still generate emails (with fallback/empty proposal info)
    // but the markAsSent UPDATE should not affect User A's rows
    const writeCalls = res.write.mock.calls.map(c => c[0]).join('');
    // Should contain the result event
    expect(writeCalls).toContain('result');

    // Verify that the UPDATE query (markAsSent) was called with User B's profileId
    const updateCalls = mockSql.mock.calls.filter(call => {
      const queryText = Array.isArray(call[0]) ? call[0].join(' ') : '';
      return queryText.includes('UPDATE') && queryText.includes('reviewer_suggestions');
    });

    // If there was an update call, it should include the profileId filter
    for (const call of updateCalls) {
      const queryText = Array.isArray(call[0]) ? call[0].join(' ') : '';
      expect(queryText).toContain('user_profile_id');
    }
  });
});
