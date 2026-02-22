/**
 * Literature Analyzer API Endpoint
 *
 * Analyzes research papers and synthesizes findings across multiple documents.
 * Uses a two-stage process:
 * 1. Claude Vision API to extract key information from each paper
 * 2. Claude to synthesize findings across all papers
 */

import { BASE_CONFIG, getModelForApp, loadModelOverrides } from '../../shared/config/baseConfig';
import {
  createPaperExtractionPrompt,
  createSynthesisPrompt,
  createComparisonPrompt
} from '../../shared/config/prompts/literature-analyzer';
import { requireAuth } from '../../lib/utils/auth';
import { logUsage } from '../../lib/utils/usage-logger';
import { nextRateLimiter } from '../../shared/api/middleware/rateLimiter';

const limiter = nextRateLimiter({ max: 5 });

// Concurrency limit for processing papers
const CONCURRENCY_LIMIT = 2;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;

  const allowed = await limiter(req, res);
  if (allowed !== true) return;

  await loadModelOverrides();

  try {
    const { files, options = {} } = req.body;
    const { focusTopic, generateComparison, comparisonType } = options;

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Claude API key not configured on server' });
    }

    const userProfileId = session?.user?.profileId || null;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const extractedPapers = [];
    let processedFiles = 0;
    const totalFiles = files.length;

    sendProgress(res, 0, `Starting analysis of ${totalFiles} paper(s)...`);

    // Stage 1: Extract information from each paper
    for (const file of files) {
      try {
        processedFiles++;
        const progressPercent = Math.round((processedFiles / totalFiles) * 60);

        sendProgress(res, progressPercent, `Analyzing paper ${processedFiles} of ${totalFiles}: ${file.filename}...`);

        // Fetch file from blob URL
        const fileResponse = await fetch(file.url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const base64 = Buffer.from(fileBuffer).toString('base64');

        // Extract paper information using Vision API
        const extractedData = await extractPaperInfo(base64, apiKey, userProfileId);

        if (extractedData && !extractedData.error) {
          extractedPapers.push({
            ...extractedData,
            sourceFile: file.filename,
            fileUrl: file.url
          });

          // Send individual paper result
          sendEvent(res, 'paper_extracted', {
            index: processedFiles - 1,
            filename: file.filename,
            title: extractedData.title,
            authors: extractedData.authors,
            year: extractedData.year
          });
        } else {
          // Paper extraction failed
          extractedPapers.push({
            sourceFile: file.filename,
            error: extractedData?.error || 'Failed to extract paper information',
            title: file.filename
          });

          sendEvent(res, 'paper_error', {
            index: processedFiles - 1,
            filename: file.filename,
            error: extractedData?.error || 'Extraction failed'
          });
        }

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        extractedPapers.push({
          sourceFile: file.filename,
          error: fileError.message,
          title: file.filename
        });
      }
    }

    // Filter successful extractions for synthesis
    const successfulPapers = extractedPapers.filter(p => !p.error);

    sendProgress(res, 70, `Extracted ${successfulPapers.length} of ${totalFiles} papers successfully`);

    let synthesis = null;
    let comparison = null;

    // Stage 2: Synthesize findings (if we have at least 2 successful papers)
    if (successfulPapers.length >= 2) {
      sendProgress(res, 75, 'Generating synthesis across papers...');

      try {
        synthesis = await generateSynthesis(successfulPapers, focusTopic, apiKey, userProfileId);
        sendEvent(res, 'synthesis_complete', { success: true });
      } catch (synthError) {
        console.error('Synthesis error:', synthError);
        synthesis = { error: synthError.message };
      }

      // Optional: Generate comparison
      if (generateComparison && successfulPapers.length >= 2) {
        sendProgress(res, 90, 'Generating comparison...');
        try {
          comparison = await generateComparisonData(successfulPapers, comparisonType || 'findings', apiKey, userProfileId);
        } catch (compError) {
          console.error('Comparison error:', compError);
          comparison = { error: compError.message };
        }
      }
    } else if (successfulPapers.length === 1) {
      // Single paper - no synthesis needed
      synthesis = {
        overview: {
          paperCount: 1,
          briefSummary: 'Single paper analyzed. Upload additional papers for cross-paper synthesis.'
        }
      };
    }

    // Send final results
    const finalData = {
      progress: 100,
      message: 'Analysis complete!',
      results: {
        papers: extractedPapers,
        synthesis,
        comparison,
        summary: {
          totalPapers: totalFiles,
          successfulExtractions: successfulPapers.length,
          errors: extractedPapers.filter(p => p.error).length,
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
 * Send named event to client
 */
function sendEvent(res, event, data) {
  res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
}

/**
 * Extract information from a single paper using Vision API
 */
async function extractPaperInfo(base64Pdf, apiKey, userProfileId) {
  const prompt = createPaperExtractionPrompt();

  const startTime = Date.now();
  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: getModelForApp('literature-analyzer', 'visionModel'),
      max_tokens: 4000,
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
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude Vision API error:', errorText);
    throw new Error(`Claude API error ${response.status}`);
  }

  const data = await response.json();
  logUsage({
    userProfileId,
    appName: 'literature-analyzer',
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    latencyMs: Date.now() - startTime,
  });
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
    console.error('Failed to parse paper extraction JSON:', parseError);
    console.error('Response was:', responseText.substring(0, 500));
    return {
      title: 'Unknown Paper',
      abstract: responseText.substring(0, 500),
      error: 'Failed to parse structured response'
    };
  }
}

/**
 * Generate synthesis across multiple papers
 */
async function generateSynthesis(papers, focusTopic, apiKey, userProfileId) {
  const prompt = createSynthesisPrompt(papers, focusTopic);

  const startTime = Date.now();
  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: getModelForApp('literature-analyzer'),
      max_tokens: 6000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error (synthesis):', errorText);
    throw new Error(`Claude API error ${response.status}`);
  }

  const data = await response.json();
  logUsage({
    userProfileId,
    appName: 'literature-analyzer',
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    latencyMs: Date.now() - startTime,
  });
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
    console.error('Failed to parse synthesis JSON:', parseError);
    return {
      synthesis: responseText.substring(0, 2000),
      parseError: true
    };
  }
}

/**
 * Generate comparison across papers
 */
async function generateComparisonData(papers, comparisonType, apiKey, userProfileId) {
  const prompt = createComparisonPrompt(papers, comparisonType);

  const startTime = Date.now();
  const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: getModelForApp('literature-analyzer'),
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error (comparison):', errorText);
    throw new Error(`Claude API error ${response.status}`);
  }

  const data = await response.json();
  logUsage({
    userProfileId,
    appName: 'literature-analyzer',
    model: data.model,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    latencyMs: Date.now() - startTime,
  });
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
    console.error('Failed to parse comparison JSON:', parseError);
    return {
      summary: responseText.substring(0, 1000),
      parseError: true
    };
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Only for JSON payload with blob URLs
    },
    responseLimit: false,
    externalResolver: true,
  },
  maxDuration: 600, // 10 minutes timeout for large paper sets
};
