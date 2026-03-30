/**
 * PanelReviewService - DB CRUD + orchestration for Virtual Review Panel
 *
 * Manages the full review pipeline:
 *   Stage 1 (optional): Claim verification — fan out to all LLMs
 *   Stage 2: Structured review — fan out to all LLMs with reviewer form
 *   Synthesis: Claude summarizes consensus, disagreements, questions
 *
 * Results are persisted to DB as they arrive for audit/replay.
 */

import { sql } from '@vercel/postgres';
import { createHash } from 'crypto';
import { MultiLLMService } from './multi-llm-service';
import { estimateCostCents } from '../utils/usage-logger';
import {
  createClaimVerificationPrompt,
  createPerplexityClaimVerificationPrompt,
  createStructuredReviewPrompt,
  createPanelSynthesisPrompt,
  parseJSONResponse,
} from '../../shared/config/prompts/virtual-review-panel';
import { getModelForApp } from '../../shared/config/baseConfig';

const SYSTEM_PROMPT = 'You are an expert scientific peer reviewer for the W. M. Keck Foundation. Respond only with valid JSON — no markdown, no commentary outside the JSON object.';

export class PanelReviewService {

  // ============================================
  // DB OPERATIONS
  // ============================================

  static async createPanelReview(userProfileId, { proposalTitle, proposalFilename, proposalText, config }) {
    const textHash = createHash('sha256').update(proposalText).digest('hex');
    const result = await sql`
      INSERT INTO panel_reviews (user_profile_id, proposal_title, proposal_filename, proposal_text_hash, config, status)
      VALUES (${userProfileId}, ${proposalTitle || 'Untitled Proposal'}, ${proposalFilename || null}, ${textHash}, ${JSON.stringify(config)}, 'pending')
      RETURNING id
    `;
    return result.rows[0].id;
  }

  static async updatePanelReview(id, updates) {
    const fields = [];
    const values = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (key === 'panelSummary' || key === 'costBreakdown' || key === 'config') {
        fields.push(`${dbKey} = $${paramIdx++}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${dbKey} = $${paramIdx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;
    values.push(id);

    await sql.query(
      `UPDATE panel_reviews SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
  }

  static async createReviewItem(panelReviewId, provider, model, stage) {
    const result = await sql`
      INSERT INTO panel_review_items (panel_review_id, llm_provider, llm_model, stage, status, started_at)
      VALUES (${panelReviewId}, ${provider}, ${model}, ${stage}, 'in_progress', NOW())
      RETURNING id
    `;
    return result.rows[0].id;
  }

  static async updateReviewItem(id, updates) {
    const fields = [];
    const values = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (key === 'parsedResponse') {
        fields.push(`${dbKey} = $${paramIdx++}`);
        values.push(JSON.stringify(value));
      } else {
        fields.push(`${dbKey} = $${paramIdx++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;
    values.push(id);

    await sql.query(
      `UPDATE panel_review_items SET ${fields.join(', ')} WHERE id = $${paramIdx}`,
      values
    );
  }

  static async getPanelReview(id) {
    const review = await sql`SELECT * FROM panel_reviews WHERE id = ${id}`;
    if (review.rows.length === 0) return null;

    const items = await sql`
      SELECT * FROM panel_review_items WHERE panel_review_id = ${id} ORDER BY created_at
    `;

    return { ...review.rows[0], items: items.rows };
  }

  static async getPanelReviewHistory(userProfileId, limit = 20) {
    const result = await sql`
      SELECT id, proposal_title, proposal_filename, status, current_stage,
             total_cost_cents, cost_breakdown, started_at, completed_at, created_at
      FROM panel_reviews
      WHERE user_profile_id = ${userProfileId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return result.rows;
  }

  // ============================================
  // ORCHESTRATION
  // ============================================

  /**
   * Run the full panel review pipeline
   *
   * @param {number} panelReviewId - DB row ID
   * @param {string} proposalText - Full proposal text
   * @param {string[]} providers - LLM providers to use
   * @param {Object} options
   * @param {boolean} options.includeClaimVerification - Run Stage 1
   * @param {Object} options.loggingContext - { userProfileId, appName }
   * @param {Function} options.sendEvent - SSE event sender
   * @returns {Promise<Object>} Final panel summary
   */
  static async runFullPanel(panelReviewId, proposalText, providers, options = {}) {
    const {
      includeClaimVerification = true,
      loggingContext = {},
      sendEvent = () => {},
    } = options;

    await this.updatePanelReview(panelReviewId, {
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });

    let claimVerificationResults = null;

    try {
      // Stage 1: Claim Verification (optional)
      if (includeClaimVerification) {
        sendEvent('stage_start', { stage: 'claim_verification', message: 'Starting claim verification...' });
        await this.updatePanelReview(panelReviewId, { currentStage: 'claim_verification' });

        claimVerificationResults = await this._runStage(
          panelReviewId, proposalText, providers, 'claim_verification', loggingContext, sendEvent
        );

        const successCount = claimVerificationResults.filter(r => r.success).length;
        sendEvent('stage_complete', {
          stage: 'claim_verification',
          message: `Claim verification complete (${successCount}/${providers.length} succeeded)`,
          results: claimVerificationResults,
        });
      }

      // Stage 2: Structured Review
      sendEvent('stage_start', { stage: 'structured_review', message: 'Starting structured review...' });
      await this.updatePanelReview(panelReviewId, { currentStage: 'structured_review' });

      const structuredReviewResults = await this._runStage(
        panelReviewId, proposalText, providers, 'structured_review', loggingContext, sendEvent,
        claimVerificationResults
      );

      const reviewSuccessCount = structuredReviewResults.filter(r => r.success).length;
      sendEvent('stage_complete', {
        stage: 'structured_review',
        message: `Structured review complete (${reviewSuccessCount}/${providers.length} succeeded)`,
        results: structuredReviewResults,
      });

      // Check minimum viable reviews (need at least 2)
      if (reviewSuccessCount < 2) {
        throw new Error(`Only ${reviewSuccessCount} review(s) succeeded — need at least 2 for synthesis`);
      }

      // Synthesis
      sendEvent('stage_start', { stage: 'synthesis', message: 'Synthesizing panel summary...' });
      await this.updatePanelReview(panelReviewId, { currentStage: 'synthesis' });

      const panelSummary = await this._runSynthesis(
        panelReviewId, structuredReviewResults, claimVerificationResults, loggingContext, sendEvent
      );

      // Calculate costs
      const costBreakdown = await this._calculateCosts(panelReviewId);
      const totalCost = Object.values(costBreakdown).reduce((sum, c) => sum + c, 0);

      await this.updatePanelReview(panelReviewId, {
        status: 'completed',
        panelSummary,
        totalCostCents: totalCost,
        costBreakdown,
        completedAt: new Date().toISOString(),
      });

      sendEvent('complete', {
        panelSummary,
        costBreakdown,
        totalCostCents: totalCost,
        claimVerifications: claimVerificationResults,
        structuredReviews: structuredReviewResults,
      });

      return { panelSummary, costBreakdown, totalCostCents: totalCost };

    } catch (error) {
      await this.updatePanelReview(panelReviewId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
      });
      sendEvent('error', { message: error.message });
      throw error;
    }
  }

  // ============================================
  // INTERNAL STAGE RUNNERS
  // ============================================

  static async _runStage(panelReviewId, proposalText, providers, stage, loggingContext, sendEvent, priorResults = null) {
    const results = [];

    // Build prompts per provider
    const promptFn = (provider) => {
      if (stage === 'claim_verification') {
        const prompt = provider === 'perplexity'
          ? createPerplexityClaimVerificationPrompt(proposalText)
          : createClaimVerificationPrompt(proposalText);
        return { prompt, systemPrompt: SYSTEM_PROMPT };
      }

      // structured_review — optionally include claim verification context
      let cvContext = null;
      if (priorResults) {
        const providerCV = priorResults.find(r => r.provider === provider && r.success);
        if (providerCV) cvContext = providerCV.parsedResponse;
        // If this provider's CV failed, use any successful one
        if (!cvContext) {
          const anyCV = priorResults.find(r => r.success);
          if (anyCV) cvContext = anyCV.parsedResponse;
        }
      }

      return {
        prompt: createStructuredReviewPrompt(proposalText, cvContext),
        systemPrompt: SYSTEM_PROMPT,
      };
    };

    // Fan out to all providers
    const settled = await Promise.allSettled(
      providers.map(async (provider) => {
        const model = MultiLLMService.getDefaultModel(provider);
        const itemId = await this.createReviewItem(panelReviewId, provider, model, stage);

        sendEvent('provider_start', {
          stage,
          provider,
          providerName: MultiLLMService.getProviderName(provider),
          message: `${MultiLLMService.getProviderName(provider)} starting ${stage.replace('_', ' ')}...`,
        });

        try {
          const { prompt, systemPrompt } = promptFn(provider);

          const result = await MultiLLMService.call(provider, prompt, {
            systemPrompt,
            loggingContext,
          });

          const parsed = parseJSONResponse(result.text);
          const cost = estimateCostCents(result.model, result.inputTokens, result.outputTokens);

          await this.updateReviewItem(itemId, {
            status: 'completed',
            rawResponse: result.text,
            parsedResponse: parsed,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            estimatedCostCents: cost,
            latencyMs: result.latencyMs,
            completedAt: new Date().toISOString(),
          });

          sendEvent('provider_complete', {
            stage,
            provider,
            providerName: MultiLLMService.getProviderName(provider),
            model: result.model,
            parsedResponse: parsed,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCents: cost,
            latencyMs: result.latencyMs,
            citations: result.citations || null,
          });

          return {
            provider,
            providerName: MultiLLMService.getProviderName(provider),
            model: result.model,
            success: true,
            parsedResponse: parsed,
            rawResponse: result.text,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCents: cost,
            latencyMs: result.latencyMs,
            citations: result.citations || null,
          };

        } catch (error) {
          await this.updateReviewItem(itemId, {
            status: 'failed',
            errorMessage: error.message,
            completedAt: new Date().toISOString(),
          });

          sendEvent('provider_error', {
            stage,
            provider,
            providerName: MultiLLMService.getProviderName(provider),
            error: error.message,
          });

          return {
            provider,
            providerName: MultiLLMService.getProviderName(provider),
            success: false,
            error: error.message,
          };
        }
      })
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      }
    }

    return results;
  }

  static async _runSynthesis(panelReviewId, structuredReviews, claimVerifications, loggingContext, sendEvent) {
    const successfulReviews = structuredReviews.filter(r => r.success);
    const successfulCVs = claimVerifications?.filter(r => r.success) || null;

    const synthesisPrompt = createPanelSynthesisPrompt(successfulReviews, successfulCVs);
    const synthesisModel = getModelForApp('virtual-review-panel');

    const result = await MultiLLMService.call('claude', synthesisPrompt, {
      systemPrompt: 'You are the chair of a grant review panel for the W. M. Keck Foundation. Respond only with valid JSON.',
      model: synthesisModel,
      maxTokens: 16384,
      loggingContext,
    });

    const parsed = parseJSONResponse(result.text);

    sendEvent('synthesis_complete', {
      panelSummary: parsed,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    });

    return parsed;
  }

  static async _calculateCosts(panelReviewId) {
    const result = await sql`
      SELECT llm_provider, SUM(estimated_cost_cents) as total_cost
      FROM panel_review_items
      WHERE panel_review_id = ${panelReviewId} AND status = 'completed'
      GROUP BY llm_provider
    `;

    const breakdown = {};
    for (const row of result.rows) {
      breakdown[row.llm_provider] = parseFloat(row.total_cost) || 0;
    }

    // Add synthesis cost (logged under 'claude' but for synthesis step)
    // The synthesis call is already included in claude's total from usage logging
    return breakdown;
  }
}
