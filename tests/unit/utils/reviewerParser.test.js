/**
 * Unit tests for Reviewer Parser utility
 */

import {
  parseReviewers,
  generateReviewerCSV,
  validateReviewerData
} from '../../../shared/utils/reviewerParser';

describe('Reviewer Parser Utilities', () => {
  
  describe('parseReviewers', () => {
    test('parses numbered reviewers with institutions', () => {
      const reviewerText = `
1. Dr. John Smith (MIT)
2. Prof. Jane Doe (Stanford University)
3. Michael Johnson (University of California, Berkeley)
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'John Smith',
        institution: 'MIT'
      });
      expect(result[1]).toEqual({
        name: 'Jane Doe',
        institution: 'Stanford University'
      });
      expect(result[2]).toEqual({
        name: 'Michael Johnson',
        institution: 'University of California, Berkeley'
      });
    });

    test('parses reviewers with dash format', () => {
      const reviewerText = `
Dr. Alice Wilson - Harvard Medical School
Bob Chen - Microsoft Research
Prof. Sarah Davis - Oxford University
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'Alice Wilson',
        institution: 'Harvard Medical School'
      });
      expect(result[1]).toEqual({
        name: 'Bob Chen',
        institution: 'Microsoft Research'
      });
      expect(result[2]).toEqual({
        name: 'Sarah Davis',
        institution: 'Oxford University'
      });
    });

    test('parses reviewers with comma format', () => {
      const reviewerText = `
Dr. Emma Thompson, Cambridge University
James Rodriguez, IBM Research
Prof. Lisa Wang, University of Toronto
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'Emma Thompson',
        institution: 'Cambridge University'
      });
      expect(result[1]).toEqual({
        name: 'James Rodriguez',
        institution: 'IBM Research'
      });
      expect(result[2]).toEqual({
        name: 'Lisa Wang',
        institution: 'University of Toronto'
      });
    });

    test('handles mixed formats', () => {
      const reviewerText = `
1. Dr. John Smith (MIT)
2. Jane Doe - Stanford University  
3. Michael Johnson, UC Berkeley
Prof. Alice Wilson (Harvard)
Bob Chen - Microsoft
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('John Smith');
      expect(result[1].name).toBe('Jane Doe');
      expect(result[2].name).toBe('Michael Johnson');
      expect(result[3].name).toBe('Alice Wilson');
      expect(result[4].name).toBe('Bob Chen');
    });

    test('filters out invalid lines', () => {
      const reviewerText = `
These are potential reviewers:
1. Dr. John Smith (MIT)
Some explanation text
2. Jane Doe (Stanford)
More text without proper format
Contact information available
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('John Smith');
      expect(result[1].name).toBe('Jane Doe');
    });

    test('filters out descriptive bullet points', () => {
      const reviewerText = `
1. Dr. John Smith (MIT)
- Mix of seniority levels from rising mid-career to senior experts
- Several reviewers have direct experience with the core technologies
2. Jane Doe (Stanford University)
- All reviewers are established in their fields
- Many have worked with similar methodologies
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'John Smith',
        institution: 'MIT'
      });
      expect(result[1]).toEqual({
        name: 'Jane Doe',
        institution: 'Stanford University'
      });
    });

    test('handles empty and invalid input', () => {
      expect(parseReviewers('')).toEqual([]);
      expect(parseReviewers(null)).toEqual([]);
      expect(parseReviewers(undefined)).toEqual([]);
      expect(parseReviewers(123)).toEqual([]);
    });

    test('removes titles from names', () => {
      const reviewerText = `
1. Dr. John Smith (MIT)
2. Prof. Jane Doe (Stanford)  
3. Professor Michael Johnson (Berkeley)
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result[0].name).toBe('John Smith');
      expect(result[1].name).toBe('Jane Doe');
      expect(result[2].name).toBe('Michael Johnson');
    });

    test('parses Claude structured format', () => {
      const reviewerText = `
1. **Dr. John Smith, Professor**
   Institution: MIT, Department of Computer Science
   Expertise: Machine learning, artificial intelligence
   Why Good Match: Expert in deep learning methods
   Seniority: Senior

2. **Jane Doe, Associate Professor** 
   Institution: Stanford University, Psychology Department
   Expertise: Computational neuroscience, cognitive modeling
   Why Good Match: Extensive work on neural networks
   Seniority: Mid-Career
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'John Smith',
        institution: 'MIT, Department of Computer Science'
      });
      expect(result[1]).toEqual({
        name: 'Jane Doe',
        institution: 'Stanford University, Psychology Department'
      });
    });

    test('filters out excluded reviewers', () => {
      const reviewerText = `
1. **Dr. John Smith, Professor**
   Institution: MIT, Department of Computer Science
   Expertise: Machine learning, artificial intelligence
   Why Good Match: Expert in deep learning methods
   Potential Concerns: Same institution as author - EXCLUDED per constraints
   Seniority: Senior

2. **Jane Doe, Associate Professor** 
   Institution: Stanford University, Psychology Department
   Expertise: Computational neuroscience, cognitive modeling
   Why Good Match: Extensive work on neural networks
   Seniority: Mid-Career

3. **Bob Wilson, Professor Emeritus**
   Institution: Harvard University, Department of Chemistry
   Expertise: Catalysis and reaction mechanisms
   Why Good Match: Pioneering work in the field
   Potential Concerns: Recently retired
   Seniority: Senior
      `;
      
      const result = parseReviewers(reviewerText);
      
      expect(result).toHaveLength(1); // Should exclude John Smith (excluded) and Bob Wilson (retired)
      expect(result[0]).toEqual({
        name: 'Jane Doe',
        institution: 'Stanford University, Psychology Department'
      });
    });
  });

  describe('generateReviewerCSV', () => {
    test('generates CSV with header and data', () => {
      const reviewers = [
        { name: 'John Smith', institution: 'MIT' },
        { name: 'Jane Doe', institution: 'Stanford University' },
        { name: 'Bob Chen', institution: 'Microsoft Research' }
      ];
      
      const csv = generateReviewerCSV(reviewers);
      
      expect(csv).toContain('name,institution');
      expect(csv).toContain('John Smith,MIT');
      expect(csv).toContain('Jane Doe,Stanford University');
      expect(csv).toContain('Bob Chen,Microsoft Research');
    });

    test('escapes CSV fields with commas', () => {
      const reviewers = [
        { name: 'John Smith, Jr.', institution: 'University of California, Santa Barbara, Department of Chemical Engineering' }
      ];
      
      const csv = generateReviewerCSV(reviewers);
      
      expect(csv).toContain('"John Smith, Jr.","University of California, Santa Barbara, Department of Chemical Engineering"');
    });

    test('escapes CSV fields with quotes', () => {
      const reviewers = [
        { name: 'John "Johnny" Smith', institution: 'MIT "Research Lab"' }
      ];
      
      const csv = generateReviewerCSV(reviewers);
      
      expect(csv).toContain('"John ""Johnny"" Smith","MIT ""Research Lab"""');
    });

    test('handles empty reviewer list', () => {
      const csv = generateReviewerCSV([]);
      
      expect(csv).toBe('name,institution\n');
    });

    test('handles null/undefined input', () => {
      expect(generateReviewerCSV(null)).toBe('name,institution\n');
      expect(generateReviewerCSV(undefined)).toBe('name,institution\n');
      expect(generateReviewerCSV('invalid')).toBe('name,institution\n');
    });
  });

  describe('validateReviewerData', () => {
    test('validates correct reviewer data', () => {
      const reviewers = [
        { name: 'John Smith', institution: 'MIT' },
        { name: 'Jane Doe', institution: 'Stanford' }
      ];
      
      expect(validateReviewerData(reviewers)).toBe(true);
    });

    test('rejects invalid data structures', () => {
      expect(validateReviewerData(null)).toBe(false);
      expect(validateReviewerData(undefined)).toBe(false);
      expect(validateReviewerData('not an array')).toBe(false);
      expect(validateReviewerData(123)).toBe(false);
    });

    test('rejects reviewers with missing fields', () => {
      const invalidReviewers = [
        { name: 'John Smith' }, // missing institution
        { institution: 'MIT' }, // missing name
        { name: 123, institution: 'MIT' }, // name not string
        { name: 'John', institution: 456 } // institution not string
      ];
      
      expect(validateReviewerData(invalidReviewers)).toBe(false);
    });

    test('handles empty array', () => {
      expect(validateReviewerData([])).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('full parsing and CSV generation workflow', () => {
      const reviewerText = `
Based on the research proposal, here are 5 potential reviewers:

1. Dr. John Smith (MIT) - Expert in machine learning and AI
2. Prof. Jane Doe (Stanford University) - Computational neuroscience researcher  
3. Michael Johnson (UC Berkeley) - Data science and algorithms
4. Dr. Alice Wilson - Harvard Medical School
5. Bob Chen, Microsoft Research

These reviewers have relevant expertise in the proposed research areas.
      `;
      
      const parsedReviewers = parseReviewers(reviewerText);
      const csv = generateReviewerCSV(parsedReviewers);
      
      expect(parsedReviewers).toHaveLength(5);
      expect(validateReviewerData(parsedReviewers)).toBe(true);
      
      expect(csv).toContain('name,institution');
      expect(csv).toContain('John Smith,MIT');
      expect(csv).toContain('Jane Doe,Stanford University');
      expect(csv).toContain('Michael Johnson,UC Berkeley');
      expect(csv).toContain('Alice Wilson,Harvard Medical School');
      expect(csv).toContain('Bob Chen,Microsoft Research');
    });
  });
});