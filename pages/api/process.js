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
        model: 'claude-sonnet-4-20250514', // Current Claude Sonnet 4 model
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
  return `Please analyze this research proposal and create a comprehensive summary following the exact format and style of the examples below. Use clear, professional language with bullet points for the Executive Summary section and paragraphs for other sections.

**FORMATTING RULES:**
- Principal Investigator names should be underlined in markdown using <u>Name</u> tags
- Academic titles should be lowercase (professor, associate professor, assistant professor)
- Use format: "The principal investigator is <u>John Smith</u>, a professor of biology at [institution]..."
- Co-investigators should also be underlined when mentioned by name

**EXECUTIVE SUMMARY FORMAT (use bullet points):**
• [Key scientific problem or question being addressed]
• [Main hypothesis, approach, or research objective]
• [Who is conducting the research and their key qualifications]
• [Expected impact or significance of the results]
• [Why this research needs foundation support rather than traditional funding]

**OTHER SECTIONS FORMAT (use paragraphs):**

**Background & Impact**
[Paragraph explaining the scientific problem, current state of knowledge, and potential impact. Include specific technical details and context.]

**Methodology** 
[Paragraph describing the research approach, techniques, and experimental design. Be specific about methods and technical approaches.]

**Personnel**
[Paragraph identifying principal investigators, their expertise, and why they are qualified for this work. Include institutional affiliations. Format as: "The principal investigator is <u>[Name]</u>, a [lowercase title] at [institution]. Co-PI <u>[Name]</u> is an [lowercase title]..." etc.]

**Justification for Keck Funding**
[Paragraph explaining why traditional funding sources would not support this work, emphasizing risk, innovation, or speculative nature. Focus on the scientific rationale for foundation support rather than financial details.]

Research Proposal Text:
---
${text.substring(0, 15000)} ${text.length > 15000 ? '...' : ''}

Write in a professional, academic tone similar to grant review documents. Focus on scientific rigor, methodology, and funding justification. Do not use flowery language or excessive enthusiasm.`;
}

async function extractStructuredData(text, filename, summary, apiKey) {
  try {
    const extractionPrompt = `Based on this research proposal, please extract the following information and return it as a JSON object.

IMPORTANT: The filename "${filename}" may contain hints about the institution name. Use this information to help identify the correct institution.

{
  "filename": "${filename}",
  "institution": "Primary institution name (check filename for hints)",
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
        model: 'claude-sonnet-4-20250514', // Current Claude Sonnet 4 model
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

function createStructuredDataFallback(text, filename) {
  return {
    filename,
    institution: extractInstitution(text, filename), // Pass filename to extraction
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

function extractInstitution(text, filename = '') {
  // First, try to extract institution from filename
  const filenameInstitution = extractInstitutionFromFilename(filename);
  if (filenameInstitution !== 'Not specified') {
    return filenameInstitution;
  }

  // If filename doesn't work, look for common institution patterns in text
  const patterns = [
    /California Institute of Technology|Caltech/i,
    /Massachusetts Institute of Technology|MIT/i,
    /University of [^,\n\.\;]*/i,
    /[A-Z][a-z]+ University/i,
    /[A-Z][a-z]+ Institute of Technology/i,
    /[A-Z][a-z]+ College/i,
    /[A-Z][a-z]+ State University/i,
    /[A-Z][a-z]+ Medical Center/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  
  return 'Not specified';
}

function extractInstitutionFromFilename(filename) {
  if (!filename) return 'Not specified';
  
  // Remove file extension and common suffixes
  const cleanName = filename
    .replace(/\.(pdf|PDF)$/, '')
    .replace(/_SE_Phase_II_Staff_Version$/, '')
    .replace(/_Phase_II.*$/, '')
    .replace(/_Staff_Version$/, '')
    .replace(/_Final$/, '')
    .replace(/_Draft$/, '');
  
  // Look for institution patterns in filename
  const patterns = [
    // Specific institutions first (more precise)
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
    if (match) {
      return match[0].trim();
    }
  }
  
  // If no pattern matches, try to extract the first part before underscore
  const parts = cleanName.split('_');
  if (parts.length > 1) {
    const firstPart = parts[0].replace(/([a-z])([A-Z])/g, '$1 $2'); // Add spaces between camelCase
    // Check if it looks like an institution name (has multiple words)
    if (firstPart.includes(' ') || firstPart.length > 15) {
      return firstPart;
    }
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
