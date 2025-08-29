/**
 * Unit tests for Find Reviewers prompt functions
 */

import {
  createExtractionPrompt,
  createReviewerPrompt, 
  parseExtractionResponse,
  extractProposalSection
} from '../../../shared/config/prompts/find-reviewers';

import {
  SHORT_PROPOSAL,
  LONG_PROPOSAL,
  MINIMAL_PROPOSAL,
  PROPOSAL_WITH_SPECIAL_CHARS,
  ERROR_CASES
} from '../../fixtures/documents/sample-proposal';

describe('Find Reviewers Prompts', () => {
  
  describe('createExtractionPrompt', () => {
    test('creates valid extraction prompt with basic input', () => {
      const prompt = createExtractionPrompt(SHORT_PROPOSAL, 'Additional context');
      
      expect(prompt).toContain('**PROPOSAL TEXT:**');
      expect(prompt).toContain('PROPOSAL TEXT:');
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain(SHORT_PROPOSAL);
      expect(prompt).toContain('Additional context');
      expect(prompt).toContain('PRIMARY_RESEARCH_AREA:');
      expect(prompt).toContain('KEY_METHODOLOGIES:');
    });

    test('handles empty additional notes', () => {
      const prompt = createExtractionPrompt(SHORT_PROPOSAL, '');
      
      expect(prompt).toContain('PROPOSAL TEXT:');
      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain(SHORT_PROPOSAL);
    });

    test('truncates long text appropriately', () => {
      const longText = 'x'.repeat(10000);
      const prompt = createExtractionPrompt(longText);
      
      expect(prompt).toContain('...[truncated]');
      expect(prompt.length).toBeLessThan(10000);
    });

    test('handles special characters correctly', () => {
      const prompt = createExtractionPrompt(PROPOSAL_WITH_SPECIAL_CHARS);
      
      expect(prompt).toContain('Résumé-based');
      expect(prompt).toContain('"Collaborative"');
      expect(prompt).toContain('François O-Connell-Smith');
    });

    test('handles minimal proposal text', () => {
      const prompt = createExtractionPrompt(MINIMAL_PROPOSAL);
      
      expect(prompt).toContain('TITLE:');
      expect(prompt).toContain(MINIMAL_PROPOSAL);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(500);
    });
  });

  describe('parseExtractionResponse', () => {
    test('parses well-formatted response correctly', () => {
      const response = `
TITLE: Advanced Computational Methods for Understanding Protein Folding
PRIMARY_RESEARCH_AREA: Computational Biology  
SECONDARY_AREAS: Biochemistry, Computer Science
KEY_METHODOLOGIES: Molecular dynamics, Machine learning
AUTHOR_INSTITUTION: Stanford University
RESEARCH_SCOPE: Computational
INTERDISCIPLINARY: Yes
KEY_INNOVATIONS: Novel algorithms
APPLICATION_DOMAINS: Drug discovery
      `;
      
      const parsed = parseExtractionResponse(response);
      
      expect(parsed.title).toBe('Advanced Computational Methods for Understanding Protein Folding');
      expect(parsed.primaryResearchArea).toBe('Computational Biology');
      expect(parsed.secondaryAreas).toBe('Biochemistry, Computer Science');
      expect(parsed.keyMethodologies).toBe('Molecular dynamics, Machine learning');
      expect(parsed.authorInstitution).toBe('Stanford University');
      expect(parsed.researchScope).toBe('Computational');
      expect(parsed.interdisciplinary).toBe('Yes');
      expect(parsed.keyInnovations).toBe('Novel algorithms');
      expect(parsed.applicationDomains).toBe('Drug discovery');
    });

    test('handles response with extra whitespace', () => {
      const response = `
        TITLE:    Spaced Title   
        PRIMARY_RESEARCH_AREA:   Computer Science  
      `;
      
      const parsed = parseExtractionResponse(response);
      
      expect(parsed.title).toBe('Spaced Title');
      expect(parsed.primaryResearchArea).toBe('Computer Science');
    });

    test('handles malformed response gracefully', () => {
      const response = `
No colons in this response
Just plain text
      `;
      
      const parsed = parseExtractionResponse(response);
      
      expect(typeof parsed).toBe('object');
      expect(Object.keys(parsed).length).toBe(0);
    });

    test('handles empty response', () => {
      const parsed = parseExtractionResponse('');
      
      expect(typeof parsed).toBe('object');
      expect(Object.keys(parsed).length).toBe(0);
    });

    test('handles colons in values correctly', () => {
      const response = `
TITLE: Study: Understanding Complex Systems
METHODS: Method 1: Analysis, Method 2: Testing
      `;
      
      const parsed = parseExtractionResponse(response);
      
      expect(parsed.title).toBe('Study: Understanding Complex Systems');
      expect(parsed.methods).toBe('Method 1: Analysis, Method 2: Testing');
    });
  });

  describe('createReviewerPrompt', () => {
    const mockExtractedInfo = {
      title: 'Test Proposal',
      primaryResearchArea: 'Computer Science',
      secondaryAreas: 'Biology, Chemistry',
      keyMethodologies: 'Machine learning, Statistics',
      authorInstitution: 'Test University',
      researchScope: 'Computational',
      interdisciplinary: 'Yes'
    };

    test('creates comprehensive reviewer prompt', () => {
      const prompt = createReviewerPrompt(
        mockExtractedInfo,
        'Dr. Suggested Reviewer',
        'Dr. Excluded Person',
        LONG_PROPOSAL
      );
      
      expect(prompt).toContain('PROPOSAL INFORMATION:');
      expect(prompt).toContain('Test Proposal');
      expect(prompt).toContain('Computer Science');
      expect(prompt).toContain('Test University');
      expect(prompt).toContain('Dr. Suggested Reviewer');
      expect(prompt).toContain('Dr. Excluded Person');
      expect(prompt).toContain('REVIEWER CRITERIA:');
      expect(prompt).toContain('OUTPUT FORMAT:');
      expect(prompt).toContain('15 potential reviewers');
    });

    test('handles empty suggestions and exclusions', () => {
      const prompt = createReviewerPrompt(mockExtractedInfo, '', '', LONG_PROPOSAL);
      
      expect(prompt).toContain('PROPOSAL INFORMATION:');
      expect(prompt).not.toContain('Suggested Reviewers');
      expect(prompt).not.toContain('Excluded Reviewers');
    });

    test('extracts abstract from proposal text', () => {
      const proposalWithAbstract = `
Title: Test Proposal

Abstract: This is the abstract section with important information about the research goals and methods.

Background: This is the background section.
      `;
      
      const prompt = createReviewerPrompt(mockExtractedInfo, '', '', proposalWithAbstract);
      
      expect(prompt).toContain('PROPOSAL ABSTRACT/EXCERPT:');
      expect(prompt).toContain('This is the abstract section');
    });

    test('falls back to beginning of text when no abstract found', () => {
      const proposalWithoutAbstract = LONG_PROPOSAL;
      
      const prompt = createReviewerPrompt(mockExtractedInfo, '', '', proposalWithoutAbstract);
      
      expect(prompt).toContain('PROPOSAL ABSTRACT/EXCERPT:');
      expect(prompt).toContain('Protein folding is one of the most fundamental');
    });

    test('handles missing extracted info gracefully', () => {
      const incompleteInfo = {
        title: 'Test Proposal'
        // missing other fields
      };
      
      const prompt = createReviewerPrompt(incompleteInfo, '', '', SHORT_PROPOSAL);
      
      expect(prompt).toContain('Test Proposal');
      expect(prompt).toContain('Not specified');
    });
  });

  describe('extractProposalSection', () => {
    test('extracts abstract section correctly', () => {
      const text = `
Title: Test Proposal

Abstract: This is the abstract with important details about the research.

Background: This is background information.
      `;
      
      const abstract = extractProposalSection(text, 'abstract');
      
      expect(abstract).toContain('This is the abstract with important details');
      expect(abstract).not.toContain('Background:');
    });

    test('extracts summary section correctly', () => {
      const text = `
Summary: This is a summary of the proposal with key points.

Introduction: More detailed introduction.
      `;
      
      const summary = extractProposalSection(text, 'summary');
      
      expect(summary).toContain('This is a summary of the proposal');
      expect(summary).not.toContain('Introduction:');
    });

    test('handles case insensitive matching', () => {
      const text = `
ABSTRACT: This is an uppercase abstract section with sufficient length to meet the minimum requirements for extraction testing purposes.
      `;
      
      const abstract = extractProposalSection(text, 'abstract');
      
      expect(abstract).toContain('This is an uppercase abstract');
    });

    test('returns null when section not found', () => {
      const text = 'This text has no abstract section.';
      
      const abstract = extractProposalSection(text, 'abstract');
      
      expect(abstract).toBeNull();
    });

    test('handles multiple patterns for section finding', () => {
      const text = `
Some text here.

abstract
This is the abstract content that should be extracted.

More text follows.
      `;
      
      const abstract = extractProposalSection(text, 'abstract');
      
      expect(abstract).toContain('This is the abstract content');
    });

    test('truncates very long sections', () => {
      const longAbstract = 'Abstract: ' + 'x'.repeat(3000);
      
      const extracted = extractProposalSection(longAbstract, 'abstract');
      
      expect(extracted.length).toBeLessThanOrEqual(2000);
    });

    test('rejects sections that are too short', () => {
      const text = 'Abstract: Short.';
      
      const abstract = extractProposalSection(text, 'abstract');
      
      expect(abstract).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('createExtractionPrompt handles null input', () => {
      expect(() => createExtractionPrompt(null)).not.toThrow();
      const prompt = createExtractionPrompt(null);
      expect(typeof prompt).toBe('string');
    });

    test('createReviewerPrompt handles undefined extracted info', () => {
      expect(() => createReviewerPrompt(undefined, '', '', SHORT_PROPOSAL)).not.toThrow();
    });

    test('parseExtractionResponse handles null input', () => {
      const result = parseExtractionResponse(null);
      expect(typeof result).toBe('object');
    });

    test('extractProposalSection handles empty string', () => {
      const result = extractProposalSection('', 'abstract');
      expect(result).toBeNull();
    });
  });
});