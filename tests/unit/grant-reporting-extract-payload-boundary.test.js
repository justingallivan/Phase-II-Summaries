/**
 * AI payload boundary tests for the grant-reporting extract route.
 *
 * Three call sites send report and/or proposal text to Claude:
 *   - extractReport()                — exported helper, used by handleFull
 *   - compareProposalToReport()      — exported helper, used by handleFull and
 *                                      handleRegenerateGoals; future PA seam
 *   - handleRegenerate (in-handler)  — single-field regeneration path
 *
 * The prompt builders embed the input text verbatim with no internal
 * truncation, so the boundary helper at the call site is the first explicit
 * cap. These tests prove that over-cap tail content (UNSENT_TAIL) cannot
 * reach the prompt and that each call site uses its declared `source` string.
 *
 * The transport itself is covered by LLMClient tests; here we mock LLMClient
 * to capture the exact prompt strings that would be sent.
 */

import {
  GRANT_REPORTING_REPORT_MAX_CHARS,
  GRANT_REPORTING_PROPOSAL_MAX_CHARS,
} from '../../lib/utils/ai-payload-boundary';

// Importing the route file pulls in the auth chain (next-auth → openid-client).
// Stub those at module load — none of these helpers exercise auth themselves.
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('@vercel/postgres', () => ({ sql: jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 })) }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));

// Capture every prompt the helpers send to Claude so the assertions below can
// pin per-call-site source strings and absence of UNSENT_TAIL.
const sentPrompts = [];
jest.mock('../../lib/services/llm-client', () => ({
  LLMClient: jest.fn().mockImplementation(() => ({
    complete: jest.fn(async ({ messages }) => {
      sentPrompts.push(messages?.[0]?.content ?? '');
      return {
        text: '{"header":{},"counts":{},"narratives":{},"goalsAssessment":{}}',
        model: 'claude-test',
        usage: { input_tokens: 100, output_tokens: 50 },
      };
    }),
  })),
}));

// usage logger / dynamics writeback should not run in unit tests
jest.mock('../../lib/utils/usage-logger', () => ({
  logUsage: jest.fn(),
  estimateCostCents: jest.fn(() => 0),
}));

jest.mock('../../lib/services/dynamics-service', () => ({
  DynamicsService: { logAiRun: jest.fn(() => Promise.resolve()) },
}));

import { extractReport, compareProposalToReport } from '../../pages/api/grant-reporting/extract';

beforeEach(() => {
  sentPrompts.length = 0;
});

function makeOverLimit(maxChars) {
  return `${'A'.repeat(maxChars + 500)}UNSENT_TAIL`;
}

describe('extractReport payload boundary', () => {
  test('caps reportText under GRANT_REPORTING_REPORT_MAX_CHARS', async () => {
    const overLimit = makeOverLimit(GRANT_REPORTING_REPORT_MAX_CHARS);

    await extractReport({
      reportText: overLimit,
      headerFromDynamics: {},
      apiKey: 'sk-ant-test',
      model: 'claude-test',
      fallback: null,
      userProfileId: 1,
    });

    expect(sentPrompts.length).toBe(1);
    expect(sentPrompts[0]).toContain('AI payload boundary: grant-reporting.extract.reportText');
    expect(sentPrompts[0]).not.toContain('UNSENT_TAIL');
  });

  test('does not insert a boundary marker when reportText is under the cap', async () => {
    await extractReport({
      reportText: 'short report',
      headerFromDynamics: {},
      apiKey: 'sk-ant-test',
      model: 'claude-test',
      fallback: null,
      userProfileId: 1,
    });

    expect(sentPrompts[0]).not.toContain('truncated');
    expect(sentPrompts[0]).toContain('short report');
  });
});

describe('compareProposalToReport payload boundary', () => {
  test('caps both proposalText and reportText with their own source strings', async () => {
    const proposal = `${'P'.repeat(GRANT_REPORTING_PROPOSAL_MAX_CHARS + 500)}UNSENT_PROPOSAL_TAIL`;
    const report = `${'R'.repeat(GRANT_REPORTING_REPORT_MAX_CHARS + 500)}UNSENT_REPORT_TAIL`;

    await compareProposalToReport({
      proposalText: proposal,
      reportText: report,
      apiKey: 'sk-ant-test',
      model: 'claude-test',
      fallback: null,
      userProfileId: 1,
    });

    expect(sentPrompts.length).toBe(1);
    const prompt = sentPrompts[0];

    // Both call-site source strings present in the bounded prompt
    expect(prompt).toContain('AI payload boundary: grant-reporting.goals.proposalText');
    expect(prompt).toContain('AI payload boundary: grant-reporting.goals.reportText');

    // Neither tail can reach the model
    expect(prompt).not.toContain('UNSENT_PROPOSAL_TAIL');
    expect(prompt).not.toContain('UNSENT_REPORT_TAIL');
  });

  test('asymmetric truncation: oversized proposal but under-cap report', async () => {
    const proposal = `${'P'.repeat(GRANT_REPORTING_PROPOSAL_MAX_CHARS + 500)}UNSENT_PROPOSAL_TAIL`;
    const report = 'a short final report'; // well under cap

    await compareProposalToReport({
      proposalText: proposal,
      reportText: report,
      apiKey: 'sk-ant-test',
      model: 'claude-test',
      fallback: null,
      userProfileId: 1,
    });

    const prompt = sentPrompts[0];
    expect(prompt).toContain('AI payload boundary: grant-reporting.goals.proposalText');
    expect(prompt).not.toContain('AI payload boundary: grant-reporting.goals.reportText');
    expect(prompt).not.toContain('UNSENT_PROPOSAL_TAIL');
    expect(prompt).toContain('a short final report');
  });
});
