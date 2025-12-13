const { PubMedService } = require('../lib/services/pubmed-service');
const { DiscoveryService } = require('../lib/services/discovery-service');

const testCandidates = [
  {
    name: 'Curtis Suttle',
    expertiseAreas: ['marine virology', 'viral ecology', 'phage']
  },
  {
    name: 'Forest Rohwer',
    expertiseAreas: ['viral ecology', 'phage', 'metagenomics']
  },
  {
    name: 'Mya Breitbart',
    expertiseAreas: ['environmental virology', 'viral diversity', 'viral ecology']
  },
  {
    name: 'Joshua Weitz',
    expertiseAreas: ['quantitative viral ecology', 'phage-bacteria dynamics', 'mathematical biology']
  },
  {
    name: 'Will Harcombe',
    expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'phage']
  }
];

async function testCandidate(suggestion) {
  const nameVariants = DiscoveryService.generateNameVariants(suggestion.name);

  let allSimpleArticles = [];
  let allDisambiguatedArticles = [];

  for (const nameVariant of nameVariants) {
    const simpleQuery = DiscoveryService.buildAuthorQuery(nameVariant);
    const simpleArticles = await PubMedService.search(simpleQuery, 30);
    allSimpleArticles.push(...simpleArticles);
    await new Promise(r => setTimeout(r, 400));

    const suggestionVariant = { ...suggestion, name: nameVariant };
    const disambiguatedQuery = DiscoveryService.buildDisambiguatedAuthorQuery(suggestionVariant);
    const disambiguatedArticles = await PubMedService.search(disambiguatedQuery, 20);
    allDisambiguatedArticles.push(...disambiguatedArticles);
    await new Promise(r => setTimeout(r, 400));
  }

  const filteredSimple = DiscoveryService.filterToMatchingAuthorMultiVariant(allSimpleArticles, nameVariants);
  const filteredDisambiguated = DiscoveryService.filterToMatchingAuthorMultiVariant(allDisambiguatedArticles, nameVariants);

  const dedupeByPmid = (articles) => {
    const seen = new Set();
    return articles.filter(a => {
      if (!a.pmid || seen.has(a.pmid)) return false;
      seen.add(a.pmid);
      return true;
    });
  };

  const dedupedSimple = dedupeByPmid(filteredSimple);
  const dedupedDisambiguated = dedupeByPmid(filteredDisambiguated);

  const MIN_PUBLICATIONS = 3;
  let finalArticles;
  let selectionReason;

  if (dedupedDisambiguated.length >= MIN_PUBLICATIONS) {
    finalArticles = dedupedDisambiguated;
    selectionReason = 'disambiguated';
  } else if (dedupedSimple.length >= MIN_PUBLICATIONS) {
    const relevantSimple = DiscoveryService.filterByExpertiseRelevance(dedupedSimple, suggestion.expertiseAreas);
    finalArticles = relevantSimple.length >= MIN_PUBLICATIONS ? relevantSimple : dedupedSimple;
    selectionReason = relevantSimple.length >= MIN_PUBLICATIONS ? 'relevantSimple' : 'simple';
  } else {
    finalArticles = dedupedSimple.length > dedupedDisambiguated.length ? dedupedSimple : dedupedDisambiguated;
    selectionReason = 'fallback';
  }

  const affiliation = DiscoveryService.extractBestAffiliationMultiVariant(finalArticles, nameVariants);
  const passes = finalArticles.length >= MIN_PUBLICATIONS;

  return {
    name: suggestion.name,
    simpleCount: dedupedSimple.length,
    disambiguatedCount: dedupedDisambiguated.length,
    finalCount: finalArticles.length,
    selectionReason,
    affiliation: affiliation ? affiliation.substring(0, 60) + '...' : 'NONE',
    passes
  };
}

async function main() {
  console.log('Testing all candidates...\n');

  const results = [];
  for (const candidate of testCandidates) {
    console.log('Testing ' + candidate.name + '...');
    const result = await testCandidate(candidate);
    results.push(result);
    const passText = result.passes ? 'PASS' : 'FAIL';
    console.log('  ' + passText + ': ' + result.finalCount + ' articles (' + result.selectionReason + ')');
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== SUMMARY ===\n');
  for (const r of results) {
    const status = r.passes ? 'PASS' : 'FAIL';
    console.log(status + ' ' + r.name + ': ' + r.simpleCount + ' simple, ' + r.disambiguatedCount + ' disamb. -> ' + r.finalCount + ' final (' + r.selectionReason + ')');
    console.log('       Affiliation: ' + r.affiliation);
  }

  const passCount = results.filter(r => r.passes).length;
  console.log('\n' + passCount + '/' + results.length + ' candidates would be verified');
}

main().catch(console.error);
