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
      const progress = Math.round((i / files.length) * 100);
      
      // Send progress update
      res.write(`data: ${JSON.stringify({
        progress,
        message: `Processing ${file.originalname}...`
      })}\n\n`);

      try {
        // Extract text from PDF
        const pdfData = await pdf(file.buffer);
        const text = pdfData.text;

        // Generate summary using Claude API
        const summary = await generateSummary(text, file.originalname, apiKey);
        results[file.originalname] = summary;

      } catch (fileError) {
        console.error(`Error processing ${file.originalname}:`, fileError);
        results[file.originalname] = {
          formatted: `Error processing ${file.originalname}: ${fileError.message}`,
          structured: {
            filename: file.originalname,
            error: fileError.message,
            timestamp: new Date().toISOString()
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
  const maxLength = 15000;
  const truncatedText = text.length > maxLength ? 
    text.substring(0, maxLength) + '\n\n[Text truncated]' : text;

  const prompt = `Summarize this research proposal using measured, precise language. Avoid hyperbolic terms.

**Executive Summary** (exactly 5 bullets, conversational tone for educated laypersons):
- Background/field overview - Explain the research area in accessible terms
- Why research is important - Describe the significance in plain language  
- Team and approach - Who's doing the work (refer to "the team", "researchers", "the investigator", etc.) and how, explained conversationally. Do NOT mention specific PI names here. Use "team" not "research team".
- Expected outcomes - What they hope to achieve, in understandable terms
- WMKF funding justification - Why they need this specific funding, conversationally

**Background & Impact** (formal tone)
[Paragraph - can mention PI names if relevant]

**Methodology** (formal tone)
[Paragraph - can mention PI names if relevant]

**Personnel** (formal tone)
[Paragraph - should include specific PI names and their qualifications/expertise]

**Necessity for WMKF Support** (formal tone)
[Paragraph - can mention PI names if relevant]

Proposal text:
${truncatedText}`;

  try {
    console.log('Making Claude API request...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241204',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    console.log('API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('API error response:', errorText);
      throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('API response received successfully');
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Invalid response format from Claude API');
    }

    const analysis = data.content[0].text;

    return {
      formatted: enhanceFormatting(analysis, filename),
      structured: createStructuredData(analysis, filename)
    };

  } catch (error) {
    console.error('Summary generation error:', error);
    throw new Error(`Summary generation failed: ${error.message}`);
  }
}


function enhanceFormatting(summary, filename) {
  let formatted = `# Research Proposal Summary\n`;
  formatted += `**Filename:** ${filename}\n`;
  formatted += `**Date Processed:** ${new Date().toLocaleDateString()}\n\n`;
  formatted += '---\n\n';
  
  let processedSummary = summary
    .replace(/\*\*Executive Summary\*\*/g, '## Executive Summary')
    .replace(/\*\*Background & Impact\*\*/g, '## Background & Impact')
    .replace(/\*\*Methodology\*\*/g, '## Methodology') 
    .replace(/\*\*Personnel\*\*/g, '## Personnel')
    .replace(/\*\*Necessity for WMKF Support\*\*/g, '## Necessity for WMKF Support');
  
  return formatted + processedSummary;
}

function createStructuredData(text, filename) {
  return {
    filename,
    institution: extractInstitution(text),
    investigators: extractInvestigators(text),
    methods: extractMethods(text),
    timestamp: new Date().toISOString(),
    wordCount: text.split(' ').length
  };
}

function extractInstitution(text) {
  const match = text.match(/University of [^,\n]*/i) || text.match(/[A-Z][a-z]+ University/i);
  return match ? match[0] : 'Not specified';
}

function extractInvestigators(text) {
  const matches = text.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g);
  return matches ? matches.slice(0, 3) : ['Not specified'];
}

function extractMethods(text) {
  const methods = [];
  if (/NMR/i.test(text)) methods.push('NMR');
  if (/spectroscopy/i.test(text)) methods.push('Spectroscopy');
  if (/kinetics/i.test(text)) methods.push('Kinetics');
  return methods.length ? methods : ['Not specified'];
}

export const config = {
  api: {
    bodyParser: false,
  },
};
