/**
 * API Route: /api/expertise-finder/batch-match
 *
 * POST: Match a single Dynamics proposal to the expertise roster.
 *
 * Resolves proposal → SharePoint folder → Phase_I_Staff_Version PDF → pdf-parse → Claude.
 * Uses the same prompt and matching logic as the interactive match endpoint.
 *
 * Request body:
 *   requestId: string       - Dynamics akoya_request GUID
 *   requestNumber: string   - For display/logging
 *   additionalNotes: string - Optional user context
 *
 * Returns: { success, matchId, results, metadata }
 */

import pdf from 'pdf-parse';
import { sql } from '@vercel/postgres';
import { requireAppAccess } from '../../../lib/utils/auth';
import { BASE_CONFIG, getModelForApp, getFallbackModelForApp, loadModelOverrides } from '../../../shared/config/baseConfig';
import { createMatchingPrompt, SYSTEM_PROMPT } from '../../../shared/config/prompts/expertise-finder';
import { logUsage, estimateCostCents } from '../../../lib/utils/usage-logger';
import { createHash } from 'crypto';
import { DynamicsService } from '../../../lib/services/dynamics-service';
import { GraphService } from '../../../lib/services/graph-service';

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
    const { requestId, requestNumber, additionalNotes } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    // Step 1: Resolve SharePoint folder for this request
    DynamicsService.bypassRestrictions();

    const locResult = await DynamicsService.queryRecords('sharepointdocumentlocations', {
      select: 'name,relativeurl,_parentsiteorlocation_value',
      filter: `_regardingobjectid_value eq '${requestId}'`,
      top: 10,
    });

    if (!locResult.records.length) {
      return res.status(404).json({
        error: 'No SharePoint document location found for this request',
        requestNumber,
      });
    }

    // Resolve parent location to get library name
    const parentIds = [...new Set(
      locResult.records.map(r => r._parentsiteorlocation_value).filter(Boolean)
    )];

    let libraryName = 'akoya_request';
    if (parentIds.length > 0) {
      try {
        const parentResult = await DynamicsService.queryRecords('sharepointdocumentlocations', {
          select: 'relativeurl',
          filter: parentIds.map(id => `sharepointdocumentlocationid eq ${id}`).join(' or '),
          top: 5,
        });
        if (parentResult.records.length > 0 && parentResult.records[0].relativeurl) {
          libraryName = parentResult.records[0].relativeurl;
        }
      } catch (e) {
        // Fall back to default
      }
    }

    const folderPath = locResult.records[0].relativeurl;

    // Step 2: List files and find Phase_I_Staff_Version PDF
    const files = await GraphService.listFiles(libraryName, folderPath);
    const staffVersionFile = files.find(f =>
      f.name.includes('Phase_I_Staff_Version') && f.name.toLowerCase().endsWith('.pdf')
    );

    if (!staffVersionFile) {
      return res.status(404).json({
        error: 'No Phase_I_Staff_Version PDF found in SharePoint folder',
        requestNumber,
        folder: folderPath,
        availableFiles: files.map(f => f.name),
      });
    }

    // Step 3: Download and extract text
    const { buffer } = await GraphService.downloadFileByPath(libraryName, folderPath, staffVersionFile.name);
    const pdfData = await pdf(buffer);
    const proposalText = pdfData.text;

    if (!proposalText || proposalText.trim().length < 100) {
      return res.status(400).json({
        error: 'PDF appears to be empty or contains insufficient text',
        requestNumber,
        filename: staffVersionFile.name,
      });
    }

    // Step 4: Fetch active roster and run Claude
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured on server' });
    }

    const rosterResult = await sql`
      SELECT * FROM expertise_roster WHERE is_active = true ORDER BY role_type, name
    `;

    if (rosterResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active roster members found' });
    }

    const prompt = createMatchingPrompt(proposalText, rosterResult.rows, additionalNotes);

    let result;
    let modelUsed = primaryModel;

    try {
      result = await callClaude(apiKey, primaryModel, prompt);
    } catch (primaryError) {
      console.warn(`[ExpertiseFinder:Batch] Primary model (${primaryModel}) failed: ${primaryError.message}, trying fallback...`);
      modelUsed = fallbackModel;
      result = await callClaude(apiKey, fallbackModel, prompt);
    }

    const latencyMs = Date.now() - startTime;

    // Step 5: Parse response
    let matchResults;
    try {
      const text = result.content[0].text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
      matchResults = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[ExpertiseFinder:Batch] Failed to parse Claude response:', parseError.message);
      return res.status(500).json({
        error: 'Failed to parse matching results',
        requestNumber,
        rawResponse: result.content[0].text,
      });
    }

    // Step 6: Save to database
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
        ${matchResults.proposal_summary?.title || requestNumber || 'Untitled'},
        ${staffVersionFile.name},
        ${textHash},
        ${JSON.stringify(matchResults)},
        ${modelUsed},
        ${inputTokens},
        ${outputTokens},
        ${costCents}
      )
      RETURNING id
    `;

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
      requestNumber,
      results: matchResults,
      metadata: {
        model: modelUsed,
        inputTokens,
        outputTokens,
        estimatedCostCents: costCents,
        latencyMs,
        rosterSize: rosterResult.rows.length,
        filename: staffVersionFile.name,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[ExpertiseFinder:Batch] Match error:', error);

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
      error: 'Failed to process proposal',
      requestNumber: req.body?.requestNumber,
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
      sizeLimit: '1mb',
    },
  },
};
