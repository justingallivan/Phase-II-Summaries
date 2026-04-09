/**
 * API Route: /api/expertise-finder/match
 *
 * POST: Match a proposal to internal staff, consultants, and board members.
 *
 * Accepts a file (blob URL from FileUploaderSimple), extracts text via pdf-parse,
 * fetches the active roster from the database, calls Claude for matching, and saves results.
 *
 * Request body:
 *   file: { url: string, filename: string } - Uploaded PDF file
 *   additionalNotes: string                  - Optional user context
 *
 * Returns: JSON with staff assignment, consultant overlap, board interest, gaps
 */

import pdf from 'pdf-parse';
import { sql } from '@vercel/postgres';
import { requireAppAccess } from '../../../lib/utils/auth';
import { BASE_CONFIG, getModelForApp, getFallbackModelForApp, loadModelOverrides } from '../../../shared/config/baseConfig';
import { createMatchingPrompt, SYSTEM_PROMPT } from '../../../shared/config/prompts/expertise-finder';
import { logUsage, estimateCostCents } from '../../../lib/utils/usage-logger';
import { safeFetch } from '../../../lib/utils/safe-fetch';
import { createHash } from 'crypto';

const APP_KEY = 'expertise-finder';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const access = await requireAppAccess(req, res, APP_KEY);
  if (!access) return;

  await loadModelOverrides();

  const startTime = Date.now();
  const primaryModel = getModelForApp(APP_KEY);
  const fallbackModel = getFallbackModelForApp(APP_KEY);

  try {
    const { file, additionalNotes } = req.body;

    if (!file || !file.url) {
      return res.status(400).json({ error: 'A PDF file is required' });
    }

    // Fetch and extract text from PDF
    const fileResponse = await safeFetch(file.url);
    if (!fileResponse.ok) {
      return res.status(400).json({ error: `Failed to fetch uploaded file: ${fileResponse.statusText}` });
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const pdfData = await pdf(Buffer.from(fileBuffer));
    const proposalText = pdfData.text;
    const proposalFilename = file.filename;

    if (!proposalText || proposalText.trim().length < 100) {
      return res.status(400).json({ error: 'PDF appears to be empty or contains insufficient text' });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured on server' });
    }

    // Fetch active roster
    const rosterResult = await sql`
      SELECT * FROM expertise_roster WHERE is_active = true ORDER BY role_type, name
    `;

    if (rosterResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active roster members found. Please add members to the roster first.' });
    }

    // Build prompt
    const prompt = createMatchingPrompt(proposalText, rosterResult.rows, additionalNotes);

    // Call Claude
    let result;
    let modelUsed = primaryModel;

    try {
      result = await callClaude(apiKey, primaryModel, prompt);
    } catch (primaryError) {
      console.warn(`[ExpertiseFinder] Primary model (${primaryModel}) failed: ${primaryError.message}, trying fallback...`);
      modelUsed = fallbackModel;
      result = await callClaude(apiKey, fallbackModel, prompt);
    }

    const latencyMs = Date.now() - startTime;

    // Parse the JSON response
    let matchResults;
    try {
      const text = result.content[0].text;
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
      matchResults = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[ExpertiseFinder] Failed to parse Claude response as JSON:', parseError.message);
      return res.status(500).json({
        error: 'Failed to parse matching results',
        rawResponse: result.content[0].text,
      });
    }

    // Save to database
    const textHash = createHash('sha256').update(proposalText).digest('hex').substring(0, 64);
    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;
    const costCents = estimateCostCents(modelUsed, inputTokens, outputTokens) || 0;

    const saveResult = await sql`
      INSERT INTO expertise_matches (
        user_profile_id, proposal_title, proposal_filename,
        proposal_text_hash, match_results, model_used,
        input_tokens, output_tokens, estimated_cost_cents
      ) VALUES (
        ${access.profileId},
        ${matchResults.proposal_summary?.title || proposalFilename || 'Untitled'},
        ${proposalFilename || null},
        ${textHash},
        ${JSON.stringify(matchResults)},
        ${modelUsed},
        ${inputTokens},
        ${outputTokens},
        ${costCents}
      )
      RETURNING id
    `;

    // Log usage
    logUsage({
      userProfileId: access.profileId,
      appName: APP_KEY,
      model: modelUsed,
      inputTokens,
      outputTokens,
      latencyMs,
      status: 'success',
    });

    return res.status(200).json({
      success: true,
      matchId: saveResult.rows[0].id,
      results: matchResults,
      metadata: {
        model: modelUsed,
        inputTokens,
        outputTokens,
        estimatedCostCents: costCents,
        latencyMs,
        rosterSize: rosterResult.rows.length,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[ExpertiseFinder] Match error:', error);

    logUsage({
      userProfileId: access.profileId,
      appName: APP_KEY,
      model: primaryModel,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: error.message,
    });

    return res.status(500).json({
      error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

async function callClaude(apiKey, model, prompt) {
  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
