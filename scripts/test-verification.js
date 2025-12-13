const { PubMedService } = require('../lib/services/pubmed-service');
const { DiscoveryService } = require('../lib/services/discovery-service');

async function testFullVerification() {
  const suggestion = {
    name: 'Will Harcombe',
    expertiseAreas: ['nutrient crossfeeding', 'microbial evolution', 'phage']
  };
  
  console.log('Testing full verification for:', suggestion.name);
  console.log('');
  
  // Step 1: Generate name variants
  const nameVariants = DiscoveryService.generateNameVariants(suggestion.name);
  console.log('Name variants:', nameVariants);
  console.log('');
  
  // Step 2: Search PubMed with all variants
  let allSimpleArticles = [];
  let allDisambiguatedArticles = [];
  
  for (const nameVariant of nameVariants) {
    const simpleQuery = DiscoveryService.buildAuthorQuery(nameVariant);
    console.log('Simple query:', simpleQuery);
    const simpleArticles = await PubMedService.search(simpleQuery, 30);
    console.log('  -> Found', simpleArticles.length, 'articles');
    allSimpleArticles.push(...simpleArticles);
    await new Promise(r => setTimeout(r, 400));
    
    const suggestionVariant = { ...suggestion, name: nameVariant };
    const disambiguatedQuery = DiscoveryService.buildDisambiguatedAuthorQuery(suggestionVariant);
    console.log('Disambiguated query:', disambiguatedQuery);
    const disambiguatedArticles = await PubMedService.search(disambiguatedQuery, 20);
    console.log('  -> Found', disambiguatedArticles.length, 'articles');
    allDisambiguatedArticles.push(...disambiguatedArticles);
    await new Promise(r => setTimeout(r, 400));
  }
  
  console.log('');
  console.log('Total simple:', allSimpleArticles.length);
  console.log('Total disambiguated:', allDisambiguatedArticles.length);
  
  // Step 3: Filter to matching author
  const filteredSimple = DiscoveryService.filterToMatchingAuthorMultiVariant(allSimpleArticles, nameVariants);
  const filteredDisambiguated = DiscoveryService.filterToMatchingAuthorMultiVariant(allDisambiguatedArticles, nameVariants);
  
  console.log('');
  console.log('After author filter:');
  console.log('  Simple:', filteredSimple.length);
  console.log('  Disambiguated:', filteredDisambiguated.length);
  
  // Step 4: Dedup by PMID
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
  
  console.log('');
  console.log('After dedup:');
  console.log('  Simple:', dedupedSimple.length);
  console.log('  Disambiguated:', dedupedDisambiguated.length);
  
  // Step 5: Selection logic
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
  
  console.log('');
  console.log('Final selection:', finalArticles.length, 'articles, reason:', selectionReason);
  
  // Step 6: Extract affiliation
  const affiliation = DiscoveryService.extractBestAffiliationMultiVariant(finalArticles, nameVariants);
  console.log('');
  console.log('Extracted affiliation:', affiliation);
  
  // Check PASS/FAIL
  console.log('');
  console.log('MIN_PUBLICATIONS:', MIN_PUBLICATIONS);
  console.log('Would PASS verification:', finalArticles.length >= MIN_PUBLICATIONS);
}

testFullVerification().catch(console.error);
