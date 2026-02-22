/**
 * Concept Evaluator API Endpoint
 *
 * Evaluates research concepts from multi-page PDFs where each page is an independent concept.
 * Uses a two-stage process:
 * 1. Claude Vision API for initial analysis (extracts metadata + keywords)
 * 2. Literature search + Claude for final evaluation with novelty assessment
 */

import { BASE_CONFIG, getModelForApp, getFallbackModelForApp, loadModelOverrides } from '../../shared/config/baseConfig';
import { splitPdfToPages } from '../../lib/utils/pdf-page-splitter';
import {
  createInitialAnalysisPrompt,
  createFinalEvaluationPrompt,
  selectDatabasesForResearchArea
} from '../../shared/config/prompts/concept-evaluator';
import { requireAuth } from '../../lib/utils/auth';
import { logUsage } from '../../lib/utils/usage-logger';

// Import search services
const { PubMedService } = require('../../lib/services/pubmed-service');
const { ArXivService } = require('../../lib/services/arxiv-service');
const { BioRxivService } = require('../../lib/services/biorxiv-service');
const { ChemRxivService } = require('../../lib/services/chemrxiv-service');

// Concurrency limit for processing pages (reduced to avoid rate limits with Opus)
const CONCURRENCY_LIMIT = 2;

// Retry configuration for Claude API calls
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 2000,
  MAX_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;
  await loadModelOverrides();

  try {
    const { files } = req.body;

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured on server' });
    }

    const userProfileId = session?.user?.profileId || null;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Limit to single file to avoid rate limits with Opus model
    if (files.length > 1) {
      return res.status(400).json({ error: 'Please upload one file at a time. The Concept Evaluator uses a powerful AI model that works best with single-file processing.' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const allResults = [];
    let totalPages = 0;
    let processedPages = 0;

    // Process each uploaded file
    for (const file of files) {
      try {
        sendProgress(res, 0, `Loading ${file.filename}...`);

        // Fetch file from blob URL
        const fileResponse = await fetch(file.url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();

        // Split PDF into individual pages
        sendProgress(res, 5, `Splitting ${file.filename} into pages...`);
        const pages = await splitPdfToPages(fileBuffer);
        totalPages += pages.length;

        sendProgress(res, 10, `Found ${pages.length} concept(s) in ${file.filename}`);

        // Process pages with concurrency control
        const fileResults = await processWithConcurrency(
          pages,
          async (page) => {
            const result = await evaluateSingleConcept(page, apiKey, res, processedPages, totalPages, userProfileId);
            processedPages++;
            return result;
          },
          CONCURRENCY_LIMIT
        );

        allResults.push(...fileResults);

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        allResults.push({
          pageNumber: 0,
          sourceFile: file.filename,
          error: fileError.message,
          title: `Error: ${file.filename}`,
          overallAssessment: `Failed to process file: ${fileError.message}`
        });
      }
    }

    // Send final results
    const finalData = {
      progress: 100,
      message: 'Evaluation complete!',
      results: {
        concepts: allResults,
        summary: {
          totalConcepts: allResults.length,
          successfulEvaluations: allResults.filter(r => !r.error).length,
          errors: allResults.filter(r => r.error).length,
          timestamp: new Date().toISOString()
        }
      }
    };

    res.write(`data: ${JSON.stringify(finalData)}\n\n`);
    res.end();

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: BASE_CONFIG.ERROR_MESSAGES.PROCESSING_FAILED,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Send progress update to client
 */
function sendProgress(res, progress, message) {
  res.write(`data: ${JSON.stringify({ progress, message })}\n\n`);
}

/**
 * Process items with concurrency control
 */
async function processWithConcurrency(items, processorFn, limit) {
  const results = [];

  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(processorFn));
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Evaluate a single concept (one page)
 */
async function evaluateSingleConcept(page, apiKey, res, processedCount, totalCount, userProfileId) {
  const { pageNumber, base64 } = page;
  const progressBase = 10 + Math.round((processedCount / totalCount) * 80);

  try {
    // Stage 1: Initial analysis via Vision API
    sendProgress(res, progressBase, `Analyzing concept ${pageNumber} of ${totalCount}...`);
    const initialAnalysis = await performInitialAnalysis(base64, apiKey, userProfileId);

    if (!initialAnalysis || initialAnalysis.error) {
      throw new Error(initialAnalysis?.error || 'Initial analysis failed');
    }

    // Stage 2: Literature search based on extracted search queries
    sendProgress(res, progressBase + 3, `Searching literature for concept ${pageNumber}...`);
    const { results: literatureResults, queriesUsed } = await searchLiterature(initialAnalysis);

    // Stage 3: Final evaluation with literature context
    sendProgress(res, progressBase + 6, `Evaluating concept ${pageNumber}...`);
    const finalEvaluation = await performFinalEvaluation(initialAnalysis, literatureResults, apiKey, userProfileId);

    return {
      pageNumber,
      ...finalEvaluation,
      literatureSearch: {
        queries: queriesUsed,
        researchArea: initialAnalysis.researchArea,
        totalFound: literatureResults.length,
        sourceBreakdown: summarizeLiteratureSources(literatureResults),
        publications: literatureResults.slice(0, 20).map(pub => {
          // Extract author names - handle both string and object formats
          const authorNames = (pub.authors || []).slice(0, 4).map(a =>
            typeof a === 'string' ? a : (a?.name || 'Unknown')
          );

          // Build URL - prefer DOI, then PMID, then ArXiv ID
          let url = null;
          if (pub.doi) {
            url = `https://doi.org/${pub.doi}`;
          } else if (pub.pmid) {
            url = `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}`;
          } else if (pub.arxivId) {
            url = `https://arxiv.org/abs/${pub.arxivId}`;
          }

          return {
            title: pub.title,
            authors: authorNames,
            year: pub.year || pub.publicationDate?.substring(0, 4),
            source: pub.source,
            journal: pub.journal || pub.venue || null,
            doi: pub.doi || null,
            url
          };
        })
      }
    };

  } catch (error) {
    console.error(`Error evaluating page ${pageNumber}:`, error);
    return {
      pageNumber,
      error: error.message,
      title: `Concept ${pageNumber}`,
      overallAssessment: `Failed to evaluate: ${error.message}`
    };
  }
}

/**
 * Check if an error is retryable (rate limit or overload)
 */
function isRetryableError(status, errorText) {
  if (status === 429 || status === 529 || status === 503) return true;
  const lowerError = (errorText || '').toLowerCase();
  return lowerError.includes('overloaded') ||
         lowerError.includes('rate limit') ||
         lowerError.includes('too many requests');
}

/**
 * Make a Claude API request with retry logic and fallback model
 */
async function callClaudeWithRetry(requestBody, apiKey, modelType = 'model', userProfileId = null) {
  const startTime = Date.now();
  const primaryModel = getModelForApp('concept-evaluator', modelType);
  const fallbackModel = getFallbackModelForApp('concept-evaluator');

  let lastError = null;
  let delay = RETRY_CONFIG.INITIAL_DELAY_MS;

  // Try primary model with retries
  for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[ConceptEvaluator] Retry attempt ${attempt}/${RETRY_CONFIG.MAX_RETRIES} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * RETRY_CONFIG.BACKOFF_MULTIPLIER, RETRY_CONFIG.MAX_DELAY_MS);
    }

    try {
      const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          ...requestBody,
          model: primaryModel
        })
      });

      if (response.ok) {
        const data = await response.json();
        logUsage({
          userProfileId,
          appName: 'concept-evaluator',
          model: data.model,
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
          latencyMs: Date.now() - startTime,
        });
        return { data, usedFallback: false, model: primaryModel };
      }

      const errorText = await response.text();
      console.error(`[ConceptEvaluator] API error (attempt ${attempt + 1}):`, response.status, errorText.substring(0, 200));

      if (!isRetryableError(response.status, errorText)) {
        throw new Error(`Claude API error ${response.status}: ${errorText.substring(0, 200)}`);
      }

      lastError = new Error(`Claude API error ${response.status}`);
    } catch (error) {
      if (error.message && !error.message.includes('Claude API error')) {
        // Network error or other non-API error
        throw error;
      }
      lastError = error;
    }
  }

  // All retries failed, try fallback model
  console.log(`[ConceptEvaluator] Primary model (${primaryModel}) failed, trying fallback (${fallbackModel})...`);

  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      ...requestBody,
      model: fallbackModel
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ConceptEvaluator] Fallback model also failed:', errorText.substring(0, 200));
    throw lastError || new Error(`Claude API error ${response.status}`);
  }

  const data = await response.json();
  logUsage({
    userProfileId,
    appName: 'concept-evaluator',
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    latencyMs: Date.now() - startTime,
  });
  console.log(`[ConceptEvaluator] Fallback model succeeded`);
  return { data, usedFallback: true, model: fallbackModel };
}

/**
 * Stage 1: Initial analysis using Claude Vision API
 */
async function performInitialAnalysis(base64Pdf, apiKey, userProfileId) {
  const prompt = createInitialAnalysisPrompt();

  const requestBody = {
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Pdf
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  };

  const { data, usedFallback, model } = await callClaudeWithRetry(requestBody, apiKey, 'visionModel', userProfileId);

  if (usedFallback) {
    console.log(`[ConceptEvaluator] Initial analysis used fallback model: ${model}`);
  }

  const responseText = data.content[0].text;

  // Parse JSON response
  try {
    // Try to extract JSON from the response (handle markdown code blocks if present)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    return JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse initial analysis JSON:', parseError);
    console.error('Response was:', responseText);
    // Return a minimal structure to allow continued processing
    return {
      title: 'Unknown Concept',
      summary: responseText.substring(0, 500),
      researchArea: 'general',
      keywords: [],
      error: 'Failed to parse structured response'
    };
  }
}

/**
 * Stage 2: Search literature databases based on search queries and research area
 *
 * Executes each query individually (not concatenated) for better results.
 */
async function searchLiterature(initialAnalysis) {
  const { searchQueries = [], researchArea = 'general' } = initialAnalysis;

  if (searchQueries.length === 0) {
    console.log('No search queries extracted, skipping literature search');
    return { results: [], queriesUsed: [] };
  }

  // Select databases based on research area
  const databases = selectDatabasesForResearchArea(researchArea);
  console.log(`Literature search for "${researchArea}": databases =`, databases);
  console.log(`Using ${searchQueries.length} queries:`, searchQueries);

  const allResults = [];
  const queriesUsed = [];

  try {
    // Execute each query individually against selected databases
    for (const query of searchQueries.slice(0, 3)) { // Max 3 queries
      queriesUsed.push(query);
      const searchPromises = [];

      if (databases.pubmed) {
        searchPromises.push(
          PubMedService.search(query, 15).then(results =>
            results.map(r => ({ ...r, source: 'PubMed', query }))
          ).catch(err => {
            console.error(`PubMed search error for "${query}":`, err.message);
            return [];
          })
        );
      }

      if (databases.arxiv) {
        searchPromises.push(
          ArXivService.search(query, 15).then(results =>
            results.map(r => ({ ...r, source: 'ArXiv', query }))
          ).catch(err => {
            console.error(`ArXiv search error for "${query}":`, err.message);
            return [];
          })
        );
      }

      if (databases.biorxiv) {
        searchPromises.push(
          BioRxivService.search(query, 15).then(results =>
            results.map(r => ({ ...r, source: 'BioRxiv', query }))
          ).catch(err => {
            console.error(`BioRxiv search error for "${query}":`, err.message);
            return [];
          })
        );
      }

      if (databases.chemrxiv) {
        searchPromises.push(
          ChemRxivService.search(query, 15).then(results =>
            results.map(r => ({ ...r, source: 'ChemRxiv', query }))
          ).catch(err => {
            console.error(`ChemRxiv search error for "${query}":`, err.message);
            return [];
          })
        );
      }

      const searchResults = await Promise.all(searchPromises);
      searchResults.forEach(results => allResults.push(...results));
    }

    // Deduplicate by title (case-insensitive)
    const seen = new Set();
    const deduped = allResults.filter(pub => {
      const key = (pub.title || '').toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter to recent publications (last 3 years)
    const threeYearsAgo = new Date().getFullYear() - 3;
    const recentResults = deduped.filter(pub => {
      const year = pub.year || parseInt(pub.publicationDate?.substring(0, 4));
      return year && year >= threeYearsAgo;
    });

    console.log(`Literature search: ${allResults.length} total, ${deduped.length} unique, ${recentResults.length} from last 3 years`);
    return {
      results: recentResults.slice(0, 30), // Limit to 30 for prompt size
      queriesUsed
    };

  } catch (error) {
    console.error('Literature search error:', error);
    return { results: [], queriesUsed };
  }
}

/**
 * Stage 3: Final evaluation with literature context
 */
async function performFinalEvaluation(initialAnalysis, literatureResults, apiKey, userProfileId) {
  const prompt = createFinalEvaluationPrompt(initialAnalysis, literatureResults);

  const requestBody = {
    max_tokens: 3000,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };

  const { data, usedFallback, model } = await callClaudeWithRetry(requestBody, apiKey, 'model', userProfileId);

  if (usedFallback) {
    console.log(`[ConceptEvaluator] Final evaluation used fallback model: ${model}`);
  }

  const responseText = data.content[0].text;

  // Parse JSON response
  try {
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    return JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse final evaluation JSON:', parseError);
    // Return partial result with raw text
    return {
      ...initialAnalysis,
      overallAssessment: responseText.substring(0, 1000),
      parseError: true
    };
  }
}

/**
 * Summarize literature sources for the result
 */
function summarizeLiteratureSources(results) {
  const sources = {};
  results.forEach(r => {
    const source = r.source || 'Unknown';
    sources[source] = (sources[source] || 0) + 1;
  });
  return sources;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Only for JSON payload with blob URLs
    },
    responseLimit: false,
    externalResolver: true,
  },
  maxDuration: 600, // 10 minutes timeout for large PDFs with many concepts
};
