import pdf from 'pdf-parse';
import { BASE_CONFIG, KECK_GUIDELINES, getModelForApp } from '../../shared/config';
import { createPhaseISummarizationPrompt } from '../../shared/config/prompts/phase-i-summaries';
import { createStructuredDataExtractionPrompt } from '../../shared/config/prompts/proposal-summarizer';


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files, apiKey, summaryLength = 2, summaryLevel = 'technical-non-expert' } = req.body;
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    console.log('Files array:', files);
    console.log('API key present:', !!apiKey);
    console.log('Summary length:', summaryLength, 'Summary level:', summaryLevel);

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const results = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = Math.round((i / files.length) * 90); // Leave 10% for final processing

      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Processing ${file.filename}...`
      })}\n\n`);

      try {
        console.log(`Processing file: ${file.filename}, URL: ${file.url}`);

        // Fetch file from blob URL
        const fileResponse = await fetch(file.url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file from blob storage: ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log(`File buffer size: ${fileBuffer.byteLength} bytes`);

        // Extract text from PDF
        const pdfData = await pdf(Buffer.from(fileBuffer));
        const text = pdfData.text;
        console.log(`Extracted text length: ${text ? text.length : 0} characters`);

        if (!text || text.trim().length < 100) {
          throw new Error('PDF appears to be empty or contains insufficient text');
        }

        // Generate summary using Claude API with Phase I prompt
        console.log(`Sending to Claude API with text length: ${text.length}`);
        const summary = await generatePhaseISummary(text, file.filename, apiKey, summaryLength, summaryLevel);
        console.log(`Received summary:`, summary ? 'Success' : 'Failed');
        results[file.filename] = summary;

      } catch (fileError) {
        console.error(`Error processing ${file.filename}:`, fileError);
        results[file.filename] = createErrorResult(file.filename, fileError.message);
      }
    }

    // Send final results
    console.log('Final results object:', JSON.stringify(results, null, 2));

    const finalData = {
      progress: 100,
      message: 'Complete!',
      results
    };
    console.log('Sending final streaming data:', JSON.stringify(finalData, null, 2));

    res.write(`data: ${JSON.stringify(finalData)}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function generatePhaseISummary(text, filename, apiKey, summaryLength, summaryLevel) {
  try {
    // Use Phase I specific prompt
    const prompt = createPhaseISummarizationPrompt(text, summaryLength, summaryLevel, KECK_GUIDELINES);

    const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: getModelForApp('batch-phase-i'),
        max_tokens: BASE_CONFIG.MODEL_PARAMS.DEFAULT_MAX_TOKENS,
        temperature: BASE_CONFIG.MODEL_PARAMS.SUMMARIZATION_TEMPERATURE,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Claude API response:', JSON.stringify(data, null, 2));
    const summaryText = data.content[0].text;
    console.log(`Summary text length: ${summaryText ? summaryText.length : 0}`);

    // Create formatted markdown version for Phase I
    const formatted = enhancePhaseIFormatting(summaryText, filename);

    // Extract structured data
    const structured = await extractStructuredData(text, filename, summaryText, apiKey);

    return {
      formatted,
      structured
    };

  } catch (error) {
    console.error('Summary generation error:', error);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

async function extractStructuredData(text, filename, summary, apiKey) {
  try {
    const extractionPrompt = createStructuredDataExtractionPrompt(text, filename);

    const response = await fetch(BASE_CONFIG.CLAUDE.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': BASE_CONFIG.CLAUDE.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: getModelForApp('batch-phase-i'),
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: extractionPrompt
        }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const jsonText = data.content[0].text;

      try {
        const parsed = JSON.parse(jsonText);
        return {
          ...parsed,
          timestamp: new Date().toISOString(),
          wordCount: text.split(' ').length
        };
      } catch (parseError) {
        console.warn('Failed to parse structured data, using fallback');
      }
    }
  } catch (error) {
    console.warn('Structured data extraction failed, using fallback:', error.message);
  }

  // Fallback to basic extraction if AI fails
  return createStructuredDataFallback(text, filename);
}

function enhancePhaseIFormatting(summary, filename) {
  const institution = extractInstitutionFromFilename(filename) || 'Research Institution';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  let formatted = `# ${institution}\n`;
  formatted += `Phase I Review: ${date}\n\n`;
  formatted += `**Filename:** ${filename}\n`;
  formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
  formatted += '---\n\n';

  // Process the summary with proper section headers
  // Phase I summaries might have different sections than Phase II
  let processedSummary = summary
    .replace(/\*\*Executive Summary\*\*/g, '## Executive Summary')
    .replace(/\*\*Background & Impact\*\*/g, '## Background & Impact')
    .replace(/\*\*Methodology\*\*/g, '## Methodology')
    .replace(/\*\*Personnel\*\*/g, '## Personnel')
    .replace(/\*\*Justification for Keck Funding\*\*/g, '## Justification for Keck Funding');

  return formatted + processedSummary;
}

function createErrorResult(filename, errorMessage) {
  return {
    formatted: `# Error Processing ${filename}\n\n**Error:** ${errorMessage}\n\n**Timestamp:** ${new Date().toISOString()}`,
    structured: {
      filename,
      institution: 'Error',
      investigators: ['Error processing'],
      methods: ['N/A'],
      error: errorMessage,
      timestamp: new Date().toISOString(),
      wordCount: 0
    },
    metadata: {
      error: true,
      errorMessage
    }
  };
}

function createStructuredDataFallback(text, filename) {
  return {
    filename,
    institution: extractInstitutionFromFilename(filename) || 'Not specified',
    principal_investigator: extractPrincipalInvestigator(text),
    investigators: extractInvestigators(text),
    research_area: extractResearchArea(text),
    methods: extractMethods(text),
    funding_amount: extractFundingAmount(text),
    duration: extractDuration(text),
    keywords: extractKeywords(text),
    timestamp: new Date().toISOString(),
    wordCount: text.split(' ').length
  };
}

// Utility functions (unchanged from original)
function extractInstitutionFromFilename(filename) {
  if (!filename) return 'Not specified';

  const cleanName = filename
    .replace(/\.(pdf|PDF)$/, '')
    .replace(/_SE_Phase_I_Staff_Version$/, '')
    .replace(/_Phase_I.*$/, '')
    .replace(/_Staff_Version$/, '')
    .replace(/_Final$/, '')
    .replace(/_Draft$/, '');

  const patterns = [
    /California Institute of Technology/i,
    /Massachusetts Institute of Technology/i,
    /University of California[^_]*/i,
    /University of [A-Za-z\s]+/i,
    /[A-Za-z\s]+ University/i,
    /[A-Za-z\s]+ Institute of Technology/i,
    /[A-Za-z\s]+ College/i,
    /[A-Za-z\s]+ State University/i,
    /[A-Za-z\s]+ Medical Center/i,
    /[A-Za-z\s]+ Research Institute/i
  ];

  for (const pattern of patterns) {
    const match = cleanName.match(pattern);
    if (match) return match[0].trim();
  }

  const parts = cleanName.split('_');
  if (parts.length > 1) {
    const firstPart = parts[0].replace(/([a-z])([A-Z])/g, '$1 $2');
    if (firstPart.includes(' ') || firstPart.length > 15) {
      return firstPart;
    }
  }

  return 'Not specified';
}

function extractPrincipalInvestigator(text) {
  const piMatch = text.match(/(?:Principal Investigator|PI)[:]\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (piMatch) return piMatch[1];

  const nameMatch = text.match(/(?:Dr\.?\s+)?([A-Z][a-z]+ [A-Z][a-z]+)/);
  return nameMatch ? nameMatch[1] : 'Not specified';
}

function extractInvestigators(text) {
  const matches = text.match(/(?:Dr\.?\s+)?([A-Z][a-z]+ [A-Z][a-z]+)/g);
  return matches ? [...new Set(matches.slice(0, 5))] : ['Not specified'];
}

function extractResearchArea(text) {
  const areas = ['biochemistry', 'chemistry', 'biology', 'physics', 'medicine', 'engineering'];
  for (const area of areas) {
    if (new RegExp(area, 'i').test(text)) {
      return area.charAt(0).toUpperCase() + area.slice(1);
    }
  }
  return 'General Science';
}

function extractMethods(text) {
  const methods = [];
  const methodsMap = {
    'NMR': /NMR|nuclear magnetic resonance/i,
    'Spectroscopy': /spectroscopy/i,
    'Kinetics': /kinetics/i,
    'Mass Spectrometry': /mass spectrometry|MS/i,
    'X-ray': /x-ray|XRD/i,
    'Cell Culture': /cell culture|tissue culture/i,
    'PCR': /PCR|polymerase chain reaction/i,
    'Microscopy': /microscopy/i
  };

  for (const [method, pattern] of Object.entries(methodsMap)) {
    if (pattern.test(text)) methods.push(method);
  }

  return methods.length ? methods : ['Not specified'];
}

function extractFundingAmount(text) {
  const amountMatch = text.match(/\$[\d,]+/);
  return amountMatch ? amountMatch[0] : 'Not specified';
}

function extractDuration(text) {
  const durationMatch = text.match(/(\d+)\s*(year|month)s?/i);
  return durationMatch ? `${durationMatch[1]} ${durationMatch[2]}s` : 'Not specified';
}

function extractKeywords(text) {
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const wordCount = {};

  words.forEach(word => {
    if (!commonWords.includes(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });

  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Only for JSON payload with blob URLs
    },
    responseLimit: false,
    externalResolver: true,
  },
  maxDuration: 300, // 5 minutes timeout for large files
};
