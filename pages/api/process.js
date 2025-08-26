import multer from 'multer';
import pdf from 'pdf-parse';
import { promisify } from 'util';
import { CONFIG, PROMPTS } from '../../lib/config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CONFIG.PDF_SIZE_LIMIT,
  },
});

const uploadMiddleware = promisify(upload.array('files'));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await uploadMiddleware(req, res);
    
    const files = req.files || [];
    const apiKey = req.body.apiKey;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const results = {};
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = Math.round((i / files.length) * 90); // Leave 10% for final processing
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Processing ${file.originalname}...`
      })}\n\n`);

      try {
        // Extract text from PDF
        const pdfData = await pdf(file.buffer);
        const text = pdfData.text;

        if (!text || text.trim().length < 100) {
          throw new Error('PDF appears to be empty or contains insufficient text');
        }

        // Generate summary using Claude API
        const summary = await generateSummary(text, file.originalname, apiKey);
        results[file.originalname] = summary;

      } catch (fileError) {
        console.error(`Error processing ${file.originalname}:`, fileError);
        results[file.originalname] = createErrorResult(file.originalname, fileError.message);
      }
    }

    // Send final results
    res.write(`data: ${JSON.stringify({
      progress: 100,
      message: 'Complete!',
      results
    })}\n\n`);

    res.end();

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function generateSummary(text, filename, apiKey) {
  try {
    const prompt = PROMPTS.SUMMARIZATION(text);
    
    const response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CONFIG.CLAUDE_MODEL,
        max_tokens: CONFIG.DEFAULT_MAX_TOKENS,
        temperature: CONFIG.SUMMARIZATION_TEMPERATURE,
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
    const summaryText = data.content[0].text;

    // Create formatted markdown version
    const formatted = enhanceFormatting(summaryText, filename);
    
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
    const extractionPrompt = PROMPTS.STRUCTURED_DATA_EXTRACTION(text, filename);

    const response = await fetch(CONFIG.CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': CONFIG.ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CONFIG.CLAUDE_MODEL,
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

function enhanceFormatting(summary, filename) {
  const institution = extractInstitutionFromFilename(filename) || 'Research Institution';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  
  let formatted = `# ${institution}\n`;
  formatted += `Phase II Review: ${date}\n\n`;
  formatted += `**Filename:** ${filename}\n`;
  formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
  formatted += '---\n\n';
  
  // Process the summary with proper section headers
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
    .replace(/_SE_Phase_II_Staff_Version$/, '')
    .replace(/_Phase_II.*$/, '')
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
    bodyParser: false,
  },
};
