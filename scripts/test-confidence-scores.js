const { PubMedService } = require('../lib/services/pubmed-service');
const { DiscoveryService } = require('../lib/services/discovery-service');

// Test multiple candidates with their likely Claude-provided expertise areas
const testCases = [
  {
    name: 'Curtis Suttle',
    expertiseAreas: ['marine virology', 'viral ecology', 'phage ecology']
  },
  {
    name: 'Forest Rohwer',
    expertiseAreas: ['viral ecology', 'phage', 'metagenomics']
  },
  {
    name: 'Benjamin Kerr',
    expertiseAreas: ['experimental evolution', 'population dynamics', 'mathematical modeling']
  },
  {
    name: 'Will Harcombe',
    expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'bacterial interactions']
  },
  {
    name: 'Mya Breitbart',
    expertiseAreas: ['environmental virology', 'viral diversity', 'viral ecology']
  }
];

async function testCandidate(candidate) {
  const nameVariants = DiscoveryService.generateNameVariants(candidate.name);

  let allSimple = [];
  for (const variant of nameVariants) {
    const query = DiscoveryService.buildAuthorQuery(variant);
    const articles = await PubMedService.search(query, 30);
    allSimple.push(...articles);
    await new Promise(r => setTimeout(r, 400));
  }

  // Filter to matching author
  const filtered = DiscoveryService.filterToMatchingAuthorMultiVariant(allSimple, nameVariants);

  // Dedup
  const seen = new Set();
  const deduped = filtered.filter(a => {
    if (!a.pmid || seen.has(a.pmid)) return false;
    seen.add(a.pmid);
    return true;
  });

  // Calculate confidence
  const confidence = DiscoveryService.calculateExpertiseMatch(deduped, candidate.expertiseAreas);

  return {
    name: candidate.name,
    articles: deduped.length,
    confidence: Math.round(confidence * 100),
    expertiseAreas: candidate.expertiseAreas
  };
}

async function main() {
  console.log('Testing improved confidence scoring...\n');

  const results = [];
  for (const candidate of testCases) {
    console.log('Testing ' + candidate.name + '...');
    const result = await testCandidate(candidate);
    results.push(result);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== CONFIDENCE SCORES ===\n');
  for (const r of results) {
    const status = r.confidence >= 50 ? 'OK' : 'LOW';
    console.log(status + ' ' + r.name + ': ' + r.confidence + '% (' + r.articles + ' articles)');
    console.log('    Expertise: ' + r.expertiseAreas.join(', '));
  }

  const lowCount = results.filter(r => r.confidence < 50).length;
  console.log('\n' + (results.length - lowCount) + '/' + results.length + ' candidates have >= 50% confidence');
}

main().catch(console.error);
