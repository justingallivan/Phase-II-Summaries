import pdf from 'pdf-parse';
import { CONFIG, PROMPTS } from '../../lib/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files, apiKey } = req.body;
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    console.log('Files array:', files);
    console.log('API key present:', !!apiKey);

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

        // Extract institution name from filename (optional)
        const institution = extractInstitutionFromFilename(file.filename);

        // Generate Phase I writeup using Claude API
        console.log(`Sending to Claude API with text length: ${text.length}`);
        const writeup = await generatePhaseIWriteup(text, file.filename, institution, apiKey);
        console.log(`Received writeup:`, writeup ? 'Success' : 'Failed');
        results[file.filename] = writeup;

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

async function generatePhaseIWriteup(text, filename, institution, apiKey) {
  try {
    console.log(`[Generate Writeup] Filename: ${filename}`);
    console.log(`[Generate Writeup] Institution parameter: "${institution}"`);
    console.log(`[Generate Writeup] Institution is ${institution ? 'provided' : 'NOT provided (will extract from PDF)'}`);
    const prompt = PROMPTS.PHASE_I_WRITEUP(text, institution);

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
    console.log('Claude API response:', JSON.stringify(data, null, 2));
    const writeupText = data.content[0].text;
    console.log(`Writeup text length: ${writeupText ? writeupText.length : 0}`);

    // Create formatted markdown version
    const formatted = enhanceFormatting(writeupText, filename);

    // Extract structured data (basic info only)
    const structured = await extractStructuredData(text, filename, writeupText, apiKey);

    return {
      formatted,
      structured
    };

  } catch (error) {
    console.error('Writeup generation error:', error);
    throw new Error(`Failed to generate writeup: ${error.message}`);
  }
}

async function extractStructuredData(text, filename, writeup, apiKey) {
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
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: extractionPrompt
        }]
      })
    });

    if (!response.ok) {
      console.error('Structured data extraction failed');
      return {};
    }

    const data = await response.json();
    const jsonText = data.content[0].text;

    // Try to parse JSON
    try {
      return JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse structured data JSON');
      return {};
    }

  } catch (error) {
    console.error('Structured data extraction error:', error);
    return {};
  }
}

function enhanceFormatting(text, filename) {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let formatted = '';
  formatted += `# Phase I Writeup: ${filename.replace('.pdf', '')}\n\n`;
  formatted += `Generated: ${date}\n\n`;
  formatted += `---\n\n`;
  formatted += text;

  return formatted;
}

function extractInstitutionFromFilename(filename) {
  // Try to extract institution name from filename
  // Common patterns: "Institution_PI_Project.pdf" or "PI_Institution.pdf"

  // Remove .pdf extension
  const nameWithoutExt = filename.replace('.pdf', '');
  console.log(`[Institution Extraction] Original filename: ${filename}`);
  console.log(`[Institution Extraction] Name without extension: ${nameWithoutExt}`);

  // Common university/institution patterns
  const institutionPatterns = [
    /\b(University of [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i,  // University of X (Y Z...)
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+University)\b/i,  // X (Y Z...) University
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Institute of Technology)\b/i,  // X (Y...) Institute of Technology
    /\b(MIT|Caltech|Stanford|Harvard|Yale|Princeton)\b/i,  // Known abbreviations
    /\b([A-Z]{2,})\b/i // Generic acronyms like UCLA, UCSF, etc.
  ];

  for (let i = 0; i < institutionPatterns.length; i++) {
    const pattern = institutionPatterns[i];
    const match = nameWithoutExt.match(pattern);
    if (match) {
      console.log(`[Institution Extraction] Pattern ${i} matched: "${match[1]}"`);
      return match[1];
    }
  }

  console.log(`[Institution Extraction] No pattern matched, returning empty string`);
  return ''; // Return empty string if no institution found
}

function createErrorResult(filename, errorMessage) {
  return {
    formatted: `# Error Processing ${filename}\n\n${errorMessage}`,
    structured: {
      error: errorMessage,
      filename
    }
  };
}
