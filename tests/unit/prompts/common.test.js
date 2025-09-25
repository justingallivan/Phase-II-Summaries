/**
 * Unit tests for common prompt utilities
 */

import {
  TEXT_LIMITS,
  TEMPERATURE_SETTINGS,
  TOKEN_LIMITS,
  truncateText,
  cleanText,
  getBasename,
  createDocumentHeader,
  parseStructuredResponse,
  createProgressUpdate,
  validatePromptParameters
} from '../../../shared/config/prompts/common';

import { ERROR_CASES } from '../../fixtures/documents/sample-proposal';

describe('Common Prompt Utilities', () => {
  
  describe('Constants', () => {
    test('TEXT_LIMITS are properly defined', () => {
      expect(TEXT_LIMITS.SMALL).toBe(5000);
      expect(TEXT_LIMITS.MEDIUM).toBe(10000);
      expect(TEXT_LIMITS.LARGE).toBe(15000);
      expect(TEXT_LIMITS.EXTRA_LARGE).toBe(20000);
      expect(TEXT_LIMITS.MAXIMUM).toBe(30000);
    });

    test('TEMPERATURE_SETTINGS are in valid range', () => {
      Object.values(TEMPERATURE_SETTINGS).forEach(temp => {
        expect(temp).toBeGreaterThanOrEqual(0);
        expect(temp).toBeLessThanOrEqual(1);
      });
    });

    test('TOKEN_LIMITS are positive integers', () => {
      Object.values(TOKEN_LIMITS).forEach(limit => {
        expect(typeof limit).toBe('number');
        expect(limit).toBeGreaterThan(0);
      });
    });
  });

  describe('truncateText', () => {
    test('truncates long text with default suffix', () => {
      const longText = 'a'.repeat(20000);
      const truncated = truncateText(longText, TEXT_LIMITS.MEDIUM);
      
      expect(truncated.length).toBe(TEXT_LIMITS.MEDIUM + 3); // +3 for '...'
      expect(truncated.endsWith('...')).toBe(true);
      expect(truncated.startsWith('aaa')).toBe(true);
    });

    test('returns original text when within limit', () => {
      const shortText = 'This is short';
      const result = truncateText(shortText, TEXT_LIMITS.MEDIUM);
      
      expect(result).toBe(shortText);
      expect(result.endsWith('...')).toBe(false);
    });

    test('handles custom suffix', () => {
      const text = 'a'.repeat(100);
      const result = truncateText(text, 50, ' [truncated]');
      
      expect(result.endsWith(' [truncated]')).toBe(true);
      expect(result.length).toBe(50 + ' [truncated]'.length);
    });

    test('handles edge cases', () => {
      expect(truncateText('')).toBe('');
      expect(truncateText(null)).toBe('');
      expect(truncateText(undefined)).toBe('');
      expect(truncateText(123)).toBe('');
    });

    test('handles exact limit boundary', () => {
      const text = 'a'.repeat(100);
      const result = truncateText(text, 100);
      
      expect(result).toBe(text);
      expect(result.endsWith('...')).toBe(false);
    });
  });

  describe('cleanText', () => {
    test('cleans whitespace properly', () => {
      const dirtyText = '   This   has    extra    spaces and sufficient length to meet minimum requirements for testing the cleaning functionality   ';
      const cleaned = cleanText(dirtyText);
      
      expect(cleaned).toBe('This has extra spaces and sufficient length to meet minimum requirements for testing the cleaning functionality');
      expect(cleaned.startsWith(' ')).toBe(false);
      expect(cleaned.endsWith(' ')).toBe(false);
    });

    test('normalizes different whitespace characters', () => {
      const text = 'Text\nwith\t\rvarious\n\nwhitespace and sufficient length to meet minimum requirements for testing purposes';
      const cleaned = cleanText(text);
      
      expect(cleaned).toBe('Text with various whitespace and sufficient length to meet minimum requirements for testing purposes');
    });

    test('enforces minimum length requirement', () => {
      const shortText = 'Too short';
      
      expect(() => cleanText(shortText, 100)).toThrow('Text too short');
    });

    test('handles error cases', () => {
      expect(() => cleanText(null)).toThrow('Invalid or insufficient text');
      expect(() => cleanText(undefined)).toThrow('Invalid or insufficient text');
      expect(() => cleanText('')).toThrow('Invalid or insufficient text');
      expect(() => cleanText(123)).toThrow('Invalid or insufficient text');
    });

    test('accepts custom minimum length', () => {
      const text = 'This is exactly twenty characters long.'.substring(0, 20);
      
      expect(() => cleanText(text, 25)).toThrow();
      expect(() => cleanText(text, 15)).not.toThrow();
    });
  });

  describe('getBasename', () => {
    test('removes file extensions correctly', () => {
      expect(getBasename('document.pdf')).toBe('document');
      expect(getBasename('research.proposal.docx')).toBe('research.proposal');
      expect(getBasename('file.txt')).toBe('file');
    });

    test('handles files without extensions', () => {
      expect(getBasename('filename')).toBe('filename');
      expect(getBasename('README')).toBe('README');
    });

    test('handles edge cases', () => {
      expect(getBasename('')).toBe('document');
      expect(getBasename(null)).toBe('document');
      expect(getBasename(undefined)).toBe('document');
    });

    test('handles multiple dots correctly', () => {
      expect(getBasename('file.backup.2023.pdf')).toBe('file.backup.2023');
      expect(getBasename('.hidden.txt')).toBe('.hidden');
    });
  });

  describe('createDocumentHeader', () => {
    test('creates basic header correctly', () => {
      const header = createDocumentHeader('Test Document', 'Analysis');
      
      expect(header).toContain('# Test Document');
      expect(header).toContain('**Type:** Analysis');
      expect(header).toContain('**Generated:**');
      expect(header).toContain('---');
    });

    test('includes optional metadata when provided', () => {
      const metadata = {
        filename: 'test.pdf',
        wordCount: 1500
      };
      
      const header = createDocumentHeader('Test', 'Summary', metadata);
      
      expect(header).toContain('**Source:** test.pdf');
      expect(header).toContain('**Length:** 1,500 words');
    });

    test('handles missing metadata gracefully', () => {
      const header = createDocumentHeader('Test');
      
      expect(header).toContain('# Test');
      expect(header).toContain('**Type:** Document');
      expect(header).not.toContain('**Source:**');
      expect(header).not.toContain('**Length:**');
    });

    test('formats word count with commas', () => {
      const metadata = { wordCount: 123456 };
      const header = createDocumentHeader('Test', 'Analysis', metadata);
      
      expect(header).toContain('**Length:** 123,456 words');
    });
  });

  describe('parseStructuredResponse', () => {
    test('parses direct JSON correctly', () => {
      const jsonString = '{"title": "Test", "count": 42}';
      const parsed = parseStructuredResponse(jsonString);
      
      expect(parsed).toEqual({ title: 'Test', count: 42 });
    });

    test('extracts JSON from markdown code blocks', () => {
      const markdown = `
Here is the data:

\`\`\`json
{"name": "Test", "value": 123}
\`\`\`

Some other text.
      `;
      
      const parsed = parseStructuredResponse(markdown);
      
      expect(parsed).toEqual({ name: 'Test', value: 123 });
    });

    test('extracts JSON from plain code blocks', () => {
      const markdown = `
\`\`\`
{"type": "response", "success": true}
\`\`\`
      `;
      
      const parsed = parseStructuredResponse(markdown);
      
      expect(parsed).toEqual({ type: 'response', success: true });
    });

    test('extracts JSON using regex fallback', () => {
      const text = `
Some text here {"extracted": "data", "number": 456} and more text.
      `;
      
      const parsed = parseStructuredResponse(text);
      
      expect(parsed).toEqual({ extracted: 'data', number: 456 });
    });

    test('handles parsing errors gracefully', () => {
      const invalidJson = '{"invalid": json}';
      const parsed = parseStructuredResponse(invalidJson);
      
      expect(parsed).toBeNull();
    });

    test('handles edge cases', () => {
      expect(parseStructuredResponse('')).toBeNull();
      expect(parseStructuredResponse(null)).toBeNull();
      expect(parseStructuredResponse(undefined)).toBeNull();
      expect(parseStructuredResponse('no json here')).toBeNull();
    });
  });

  describe('createProgressUpdate', () => {
    test('calculates percentage correctly', () => {
      const progress = createProgressUpdate(3, 10, 'Processing...');
      
      expect(progress.progress).toBe(30);
      expect(progress.current).toBe(3);
      expect(progress.total).toBe(10);
      expect(progress.message).toBe('Processing...');
      expect(progress.timestamp).toBeDefined();
    });

    test('handles edge cases', () => {
      const zeroTotal = createProgressUpdate(0, 0, 'Test');
      expect(zeroTotal.progress).toBe(0);
      
      const complete = createProgressUpdate(5, 5, 'Done');
      expect(complete.progress).toBe(100);
    });

    test('includes valid timestamp', () => {
      const progress = createProgressUpdate(1, 2, 'Test');
      const timestamp = new Date(progress.timestamp);
      
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('validatePromptParameters', () => {
    test('validates correct parameters', () => {
      const params = {
        text: 'This is a valid text with sufficient length for testing purposes.',
        filename: 'test.pdf',
        textLimit: 5000,
        temperature: 0.3
      };
      
      const result = validatePromptParameters(params);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('detects missing required parameters', () => {
      const result = validatePromptParameters({});
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Text content is required');
    });

    test('validates text parameter type and length', () => {
      const shortText = validatePromptParameters({ text: 'Too short' });
      expect(shortText.warnings).toContain('Text is very short and may not produce meaningful results');
      
      const nonString = validatePromptParameters({ text: 123 });
      expect(nonString.errors).toContain('Text must be a string');
    });

    test('validates filename parameter', () => {
      const result = validatePromptParameters({ 
        text: 'Valid text here',
        filename: 123 
      });
      
      expect(result.errors).toContain('Filename must be a string');
    });

    test('validates text limit parameter', () => {
      const invalidLimit = validatePromptParameters({
        text: 'Valid text',
        textLimit: 50
      });
      
      expect(invalidLimit.errors).toContain('Text limit must be a number >= 100');
    });

    test('validates temperature parameter', () => {
      const invalidTemp = validatePromptParameters({
        text: 'Valid text',
        temperature: 1.5
      });
      
      expect(invalidTemp.errors).toContain('Temperature must be a number between 0 and 1');
    });

    test('handles multiple validation errors', () => {
      const params = {
        text: 123,
        filename: null,
        textLimit: -100,
        temperature: 2
      };
      
      const result = validatePromptParameters(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('distinguishes between errors and warnings', () => {
      const params = {
        text: 'Short but valid text', // This should generate a warning, not an error
        temperature: 1.5 // This should generate an error
      };
      
      const result = validatePromptParameters(params);
      
      expect(result.isValid).toBe(false); // Has errors
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});