/**
 * Test the relevance parsing for Track B candidates
 */

const { parseDiscoveredReasoningResponse } = require('../shared/config/prompts/reviewer-finder.js');

// Test the new parsing format
const mockCandidates = [
  { name: 'Dr. Relevant Person' },
  { name: 'Dr. Irrelevant Person' },
  { name: 'Dr. Another Relevant' }
];

const mockResponse = `
1. RELEVANT: Yes | REASONING: This researcher studies microbial ecology which directly relates to the proposal. | SENIORITY: Mid-career
2. RELEVANT: No | REASONING: This researcher is a physicist studying orbital mechanics, unrelated to microbiology. | SENIORITY: Senior
3. RELEVANT: Yes | REASONING: Studies viral dynamics which is relevant to the phage research proposed. | SENIORITY: Early-career
`;

console.log('Testing relevance parsing...\n');

const result = parseDiscoveredReasoningResponse(mockResponse, mockCandidates);

console.log('Parsing test results:');
result.forEach(c => {
  const reasoningSnippet = c.generatedReasoning ? c.generatedReasoning.substring(0, 50) + '...' : 'N/A';
  console.log('  -', c.name);
  console.log('    isRelevant:', c.isRelevant);
  console.log('    seniority:', c.seniorityEstimate);
  console.log('    reasoning:', reasoningSnippet);
  console.log('');
});

const relevant = result.filter(c => c.isRelevant !== false);
const irrelevant = result.filter(c => c.isRelevant === false);

console.log('Summary:');
console.log('  Relevant:', relevant.length);
console.log('  Irrelevant:', irrelevant.length);

if (relevant.length === 2 && irrelevant.length === 1) {
  console.log('\n✓ PASS: Parsing works correctly!');
} else {
  console.log('\n✗ FAIL: Expected 2 relevant, 1 irrelevant');
}
