import multer from 'multer';
import pdf from 'pdf-parse';
import { promisify } from 'util';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
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
        results[file.originalname] = {
          formatted: `# Error Processing ${file.originalname}\n\n**Error:** ${fileError.message}\n\n**Timestamp:** ${new Date().toISOString()}`,
          structured: {
            filename: file.originalname,
            institution: 'Error',
            investigators: ['Error processing'],
            methods: ['N/A'],
            error: fileError.message,
            timestamp: new Date().toISOString(),
            wordCount: 0
          }
        };
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
    const prompt = createSummarizationPrompt(text);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022', // Using the correct model name
        max_tokens: 2000,
        temperature: 0.3,
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

function createSummarizationPrompt(text) {
  return `Please analyze this research proposal and create a comprehensive summary in the following format:

**Executive Summary**
[2-3 sentences describing the core research question and approach]

**Background & Impact**
[Brief overview of the problem being addressed and potential impact]

**Methodology**
[Key research methods and approaches to be used]

**Personnel**
[Principal investigators and key team members mentioned]

**Necessity for WMKF Support**
[Why this research requires WMKF funding specifically]

Research Proposal Text:
---
${text.substring(0, 15000)} ${text.length > 15000 ? '...' : ''}

Please provide a clear, professional summary that captures the essence of this proposal. Focus on the scientific merit, methodology, and funding justification.`;
}

async function extractStructuredData(text, filename, summary, apiKey) {
  try {
    const extractionPrompt = `Based on this research proposal, please extract the following information and return it as a JSON object:

{
  "filename": "${filename}",
  "institution": "Primary institution name",
  "principal_investigator": "Name of PI",
  "investigators": ["List", "of", "investigators"],
  "research_area": "Main research domain",
  "methods": ["List", "of", "key", "methods"],
  "funding_amount": "Amount requested if mentioned",
  "duration": "Project duration if mentioned",
  "keywords": ["Key", "research", "terms"]
}

Research text:
${text.substring(0, 10000)} ${text.length > 10000 ? '...' : ''}

Return only the JSON object, no other text.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
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
        // Try to parse the JSON response
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
  let formatted = `# Research Proposal Summary\n`;
  formatted += `**Filename:** ${filename}\n`;
  formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
  formatted += '---\n\n';
  
  // Clean up the summary formatting
  let processedSummary = summary
    .replace(/\*\*Executive Summary\*\*/g, '## Executive Summary')
    .replace(/\*\*Background & Impact\*\*/g, '## Background & Impact')
    .replace(/\*\*Methodology\*\*/g, '## Methodology') 
    .replace(/\*\*Personnel\*\*/g, '## Personnel')
    .replace(/\*\*Necessity for WMKF Support\*\*/g, '## Necessity for WMKF Support');
  
  return formatted + processedSummary;
}

function createStructuredDataFallback(text, filename) {
  return {
    filename,
    institution: extractInstitution(text),
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

function extractInstitution(text) {
  // Look for common institution patterns
  const patterns = [
    /University of [^,\n\.]*/i,
    /[A-Z][a-z]+ University/i,
    /[A-Z][a-z]+ Institute of Technology/i,
    /[A-Z][a-z]+ College/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  
  return 'Not specified';
}

function extractPrincipalInvestigator(text) {
  // Look for PI patterns
  const piMatch = text.match(/(?:Principal Investigator|PI)[:]\s*([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (piMatch) return piMatch[1];
  
  // Fallback to first name-like pattern
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
  // Simple keyword extraction - could be enhanced
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
