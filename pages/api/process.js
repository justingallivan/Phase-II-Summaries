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
  try {
    console.log('Testing API key with simple request...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: 'Hello, please respond with just "API working"'
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
    console.log('API test successful');

    return {
      formatted: `API Test Successful!\n\nResponse: ${data.content[0].text}\n\nYour API key works. Now we can fix the model name.`,
      structured: { filename, test: 'success', timestamp: new Date().toISOString() }
    };

  } catch (error) {
    console.error('API test error:', error);
    throw new Error(`API test failed: ${error.message}`);
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
