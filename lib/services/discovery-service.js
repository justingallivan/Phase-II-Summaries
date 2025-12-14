/**
 * DiscoveryService - Stage 2 of Expert Reviewer Finder
 *
 * Orchestrates the two-track discovery process:
 * - Track A: Verify Claude's reviewer suggestions via database searches
 * - Track B: Discover new candidates from search queries
 *
 * Uses PubMed, ArXiv, and BioRxiv (all free APIs)
 */

const { PubMedService } = require('./pubmed-service');
const { ArXivService } = require('./arxiv-service');
const { BioRxivService } = require('./biorxiv-service');
const { DeduplicationService } = require('./deduplication-service');
const { DatabaseService } = require('./database-service');

// Enable verbose logging only in development with DEBUG_REVIEWER_FINDER env var
const DEBUG = process.env.DEBUG_REVIEWER_FINDER === 'true';

// PubMed rate limiting: 10 req/sec with API key, 3 req/sec without
const NCBI_API_KEY = process.env.NCBI_API_KEY;
const PUBMED_DELAY = NCBI_API_KEY ? 100 : 350;

class DiscoveryService {
  // Minimum publications in last 5 years to be considered "active"
  static MIN_PUBLICATIONS = 3;
  static YEARS_LOOKBACK = 5;

  /**
   * Main discovery function - runs both tracks
   *
   * @param {Object} analysisResult - Result from Stage 1 Claude analysis
   * @param {Object} options - Discovery options
   * @param {boolean} options.searchPubmed - Search PubMed (default: true)
   * @param {boolean} options.searchArxiv - Search ArXiv (default: true)
   * @param {boolean} options.searchBiorxiv - Search BioRxiv (default: true)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<Object>} Combined discovery results
   */
  static async discover(analysisResult, options = {}) {
    const {
      searchPubmed = true,
      searchArxiv = true,
      searchBiorxiv = true,
      onProgress = () => {}
    } = options;

    const results = {
      verified: [],      // Claude suggestions verified in databases
      unverified: [],    // Claude suggestions not found
      discovered: [],    // New candidates from database searches
      stats: {
        claudeSuggestionsTotal: 0,
        claudeSuggestionsVerified: 0,
        candidatesFromPubmed: 0,
        candidatesFromArxiv: 0,
        candidatesFromBiorxiv: 0,
        totalBeforeDedup: 0,
        totalAfterDedup: 0,
        filteredByCOI: 0
      }
    };

    const { proposalInfo, reviewerSuggestions, searchQueries } = analysisResult;

    results.stats.claudeSuggestionsTotal = reviewerSuggestions?.length || 0;

    // ============================================
    // TRACK A: Verify Claude's Suggestions
    // ============================================
    onProgress({
      stage: 'discovery',
      track: 'A',
      status: 'starting',
      message: `Verifying ${reviewerSuggestions?.length || 0} Claude suggestions...`
    });

    if (reviewerSuggestions && reviewerSuggestions.length > 0) {
      const verificationResults = await this.verifyClaudeSuggestions(
        reviewerSuggestions,
        (progress) => onProgress({ ...progress, track: 'A' })
      );

      results.verified = verificationResults.verified;
      results.unverified = verificationResults.unverified;
      results.stats.claudeSuggestionsVerified = verificationResults.verified.length;
    }

    // ============================================
    // TRACK B: Discover New Candidates
    // ============================================
    onProgress({
      stage: 'discovery',
      track: 'B',
      status: 'starting',
      message: 'Searching databases for additional candidates...'
    });

    const allDiscovered = [];

    // Search PubMed
    if (searchPubmed && searchQueries?.pubmed?.length > 0) {
      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: 'Searching PubMed...',
        source: 'pubmed'
      });

      const pubmedCandidates = await this.searchPubMed(searchQueries.pubmed, onProgress);
      allDiscovered.push(...pubmedCandidates);
      results.stats.candidatesFromPubmed = pubmedCandidates.length;
    }

    // Search ArXiv
    if (searchArxiv && searchQueries?.arxiv?.length > 0) {
      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: 'Searching ArXiv...',
        source: 'arxiv'
      });

      const arxivCandidates = await this.searchArXiv(searchQueries.arxiv, onProgress);
      allDiscovered.push(...arxivCandidates);
      results.stats.candidatesFromArxiv = arxivCandidates.length;
    }

    // Search BioRxiv
    if (searchBiorxiv && searchQueries?.biorxiv?.length > 0) {
      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: 'Searching BioRxiv...',
        source: 'biorxiv'
      });

      const biorxivCandidates = await this.searchBioRxiv(searchQueries.biorxiv, onProgress);
      allDiscovered.push(...biorxivCandidates);
      results.stats.candidatesFromBiorxiv = biorxivCandidates.length;
    }

    results.stats.totalBeforeDedup = allDiscovered.length;

    // ============================================
    // Deduplicate and Filter
    // ============================================
    onProgress({
      stage: 'discovery',
      status: 'deduplicating',
      message: `Deduplicating ${allDiscovered.length} candidates...`
    });

    // Remove candidates that match verified Claude suggestions
    const verifiedNames = results.verified.map(v => v.name.toLowerCase());
    const newCandidates = allDiscovered.filter(c =>
      !verifiedNames.some(vn =>
        DeduplicationService.areNamesSimilar(c.name, vn)
      )
    );

    // Deduplicate among discovered candidates
    const deduplicated = await DeduplicationService.deduplicateAndStore(newCandidates);

    results.stats.totalAfterDedup = deduplicated.length;

    // Filter by COI (exclude author's institution)
    const authorInstitution = proposalInfo?.authorInstitution;
    const filtered = DeduplicationService.filterConflicts(
      deduplicated,
      authorInstitution
    );

    results.stats.filteredByCOI = deduplicated.length - filtered.length;

    // Filter by minimum publications
    const qualified = filtered.filter(c =>
      (c.publications?.length || 0) >= this.MIN_PUBLICATIONS
    );

    results.discovered = qualified;

    onProgress({
      stage: 'discovery',
      status: 'complete',
      message: `Discovery complete: ${results.verified.length} verified, ${results.discovered.length} discovered`
    });

    return results;
  }

  /**
   * Track A: Verify Claude's suggestions via PubMed
   *
   * Uses expertise areas from Claude to disambiguate common names.
   * Searches with name + expertise keywords to find the right person.
   */
  static async verifyClaudeSuggestions(suggestions, onProgress) {
    const verified = [];
    const unverified = [];

    for (let i = 0; i < suggestions.length; i++) {
      const suggestion = suggestions[i];

      onProgress({
        stage: 'verification',
        status: 'verifying',
        message: `Verifying ${suggestion.name} (${i + 1}/${suggestions.length})...`
      });

      // First check local database
      const existing = await DatabaseService.findResearcher(suggestion.name);
      if (existing && existing.publications?.length >= this.MIN_PUBLICATIONS) {
        verified.push({
          ...suggestion,
          ...existing,
          verified: true,
          verificationSource: 'database',
          source: 'claude_suggestion'
        });
        continue;
      }

      // Try multiple name variants to handle nicknames (Will -> William)
      const nameVariants = this.generateNameVariants(suggestion.name);
      let allSimpleArticles = [];
      let allDisambiguatedArticles = [];

      for (const nameVariant of nameVariants) {
        // Simple author search for this variant
        const simpleQuery = this.buildAuthorQuery(nameVariant);
        const simpleArticles = await PubMedService.search(simpleQuery, 30);
        allSimpleArticles.push(...simpleArticles);
        await new Promise(resolve => setTimeout(resolve, PUBMED_DELAY));

        // Disambiguated search with expertise for this variant
        const suggestionVariant = { ...suggestion, name: nameVariant };
        const disambiguatedQuery = this.buildDisambiguatedAuthorQuery(suggestionVariant);
        const disambiguatedArticles = await PubMedService.search(disambiguatedQuery, 20);
        allDisambiguatedArticles.push(...disambiguatedArticles);
        await new Promise(resolve => setTimeout(resolve, PUBMED_DELAY));
      }

      // CRITICAL: Filter results to only include papers where our target is actually an author
      // This fixes the cache problem where "Will Harcombe" cached results include "Helen Harcombe"
      // Filter against ALL name variants
      const filteredSimple = this.filterToMatchingAuthorMultiVariant(allSimpleArticles, nameVariants);
      const filteredDisambiguated = this.filterToMatchingAuthorMultiVariant(allDisambiguatedArticles, nameVariants);

      if (DEBUG) {
        console.log(`[${suggestion.name}] Search results: simple=${allSimpleArticles.length}, disambiguated=${allDisambiguatedArticles.length}`);
        console.log(`[${suggestion.name}] After author filter: simple=${filteredSimple.length}, disambiguated=${filteredDisambiguated.length}`);
      }

      // Deduplicate by PMID
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

      if (DEBUG) {
        console.log(`[${suggestion.name}] After dedup: simple=${dedupedSimple.length}, disambiguated=${dedupedDisambiguated.length}`);
      }

      // Use whichever gives better results
      let finalArticles;
      let selectionReason;
      if (dedupedDisambiguated.length >= this.MIN_PUBLICATIONS) {
        // Prefer disambiguated if it has enough results (more relevant)
        finalArticles = dedupedDisambiguated;
        selectionReason = 'disambiguated';
      } else if (dedupedSimple.length >= this.MIN_PUBLICATIONS) {
        // Filter simple results by expertise relevance
        const relevantSimple = this.filterByExpertiseRelevance(dedupedSimple, suggestion.expertiseAreas);
        finalArticles = relevantSimple.length >= this.MIN_PUBLICATIONS ? relevantSimple : dedupedSimple;
        selectionReason = relevantSimple.length >= this.MIN_PUBLICATIONS ? 'relevantSimple' : 'simple';
      } else {
        // Take whatever we have
        finalArticles = dedupedSimple.length > dedupedDisambiguated.length ? dedupedSimple : dedupedDisambiguated;
        selectionReason = 'fallback';
      }

      if (DEBUG) {
        console.log(`[${suggestion.name}] Final: ${finalArticles.length} articles (${selectionReason}), need ${this.MIN_PUBLICATIONS}`);
      }

      if (finalArticles.length >= this.MIN_PUBLICATIONS) {
        // Extract affiliation for this specific author (not just any author on the paper)
        // Try all name variants to find the best affiliation
        const affiliation = this.extractBestAffiliationMultiVariant(finalArticles, nameVariants);

        // Calculate a confidence score based on expertise match
        const expertiseMatch = this.calculateExpertiseMatch(finalArticles, suggestion.expertiseAreas);

        // Verification: Accept if we found sufficient publications for this author.
        // The expertise match score is passed to the UI for display but doesn't
        // cause rejection - legitimate experts like Suttle, Rohwer, Fuhrman may have
        // low keyword match scores due to terminology differences.
        if (DEBUG && expertiseMatch < 0.35) {
          console.log(`[${suggestion.name}] Low expertise match: ${Math.round(expertiseMatch * 100)}% - accepting (has ${finalArticles.length} publications)`);
        }

        verified.push({
          ...suggestion,
          verified: true,
          verificationSource: 'pubmed',
          verificationConfidence: expertiseMatch,
          affiliation: affiliation || suggestion.affiliation,
          publications: finalArticles.slice(0, 5).map(a => ({
            title: a.title,
            year: a.year,
            pmid: a.pmid,
            journal: a.journal,
            url: a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}` : null
          })),
          publicationCount5yr: this.countRecentPublications(finalArticles),
          source: 'claude_suggestion'
        });
      } else {
        const reason = finalArticles.length === 0
          ? 'No publications found matching expertise'
          : `Only ${finalArticles.length} relevant publications (minimum: ${this.MIN_PUBLICATIONS})`;
        if (DEBUG) {
          console.log(`[${suggestion.name}] REJECTED: ${reason}`);
        }
        unverified.push({
          ...suggestion,
          verified: false,
          reason
        });
      }
    }

    return { verified, unverified };
  }

  /**
   * Track B: Search PubMed with generated queries
   */
  static async searchPubMed(queries, onProgress) {
    const candidates = [];
    const cutoffYear = new Date().getFullYear() - this.YEARS_LOOKBACK;

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];

      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: `PubMed query ${i + 1}/${queries.length}: "${query.substring(0, 40)}..."`,
        source: 'pubmed'
      });

      // Add date filter to query
      const dateQuery = `${query} AND (${cutoffYear}:${new Date().getFullYear()}[pdat])`;
      const articles = await PubMedService.search(dateQuery, 50);

      // Extract senior authors (last author of each paper)
      for (const article of articles) {
        if (article.authors && article.authors.length > 0) {
          const seniorAuthor = article.authors[article.authors.length - 1];
          if (seniorAuthor?.name) {
            candidates.push({
              name: seniorAuthor.name,
              affiliation: seniorAuthor.affiliation,
              publications: [{
                title: article.title,
                year: article.year,
                pmid: article.pmid,
                journal: article.journal,
                doi: article.doi,
                url: article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}` : null
              }],
              source: 'pubmed'
            });
          }
        }
      }

      // Rate limit between queries
      if (i < queries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, PUBMED_DELAY));
      }
    }

    return candidates;
  }

  /**
   * Track B: Search ArXiv with generated queries
   */
  static async searchArXiv(queries, onProgress) {
    const candidates = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];

      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: `ArXiv query ${i + 1}/${queries.length}: "${query.substring(0, 40)}..."`,
        source: 'arxiv'
      });

      const articles = await ArXivService.search(query, 50);

      // Extract senior authors
      for (const article of articles) {
        if (article.authors && article.authors.length > 0) {
          const seniorAuthor = article.authors[article.authors.length - 1];
          if (seniorAuthor) {
            candidates.push({
              name: typeof seniorAuthor === 'string' ? seniorAuthor : seniorAuthor.name,
              publications: [{
                title: article.title,
                year: article.year,
                arxivId: article.arxivId,
                doi: article.doi,
                url: article.arxivId ? `https://arxiv.org/abs/${article.arxivId}` : null
              }],
              source: 'arxiv'
            });
          }
        }
      }

      // Note: ArXiv service already has built-in 3000ms rate limiting per request
    }

    return candidates;
  }

  /**
   * Track B: Search BioRxiv with generated queries
   */
  static async searchBioRxiv(queries, onProgress) {
    const candidates = [];

    // Import BioRxivService dynamically to handle potential missing dependency
    let BioRxivService;
    try {
      BioRxivService = require('./biorxiv-service').BioRxivService;
    } catch {
      console.warn('BioRxiv service not available');
      return [];
    }

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];

      onProgress({
        stage: 'discovery',
        track: 'B',
        status: 'searching',
        message: `BioRxiv query ${i + 1}/${queries.length}: "${query.substring(0, 40)}..."`,
        source: 'biorxiv'
      });

      const articles = await BioRxivService.search(query, 50);

      // Extract senior authors
      // BioRxiv returns correspondingAuthor as name and institution as separate field
      for (const article of articles) {
        // Use corresponding author (typically the PI/lab head) - BioRxiv provides this directly
        const authorName = article.correspondingAuthor || (article.authors && article.authors[0]);
        if (authorName) {
          candidates.push({
            name: typeof authorName === 'string' ? authorName : authorName.name,
            // BioRxiv provides institution at article level, not author level
            affiliation: article.institution || undefined,
            publications: [{
              title: article.title,
              year: article.year,
              doi: article.doi,
              url: article.doi ? `https://doi.org/${article.doi}` : null
            }],
            source: 'biorxiv'
          });
        }
      }

      // Note: BioRxiv service already has built-in 5000ms rate limiting per request
    }

    return candidates;
  }

  /**
   * Build a PubMed author query
   */
  static buildAuthorQuery(name) {
    // Clean up the name
    const cleanName = name
      .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
      .trim();

    // Add author field and date filter
    const cutoffYear = new Date().getFullYear() - this.YEARS_LOOKBACK;
    return `${cleanName}[Author] AND (${cutoffYear}:${new Date().getFullYear()}[pdat])`;
  }

  /**
   * Generate alternative name variants for PubMed search
   * "Will Harcombe" -> ["Will Harcombe", "William Harcombe", "W Harcombe"]
   * Handles common nickname expansions
   */
  static generateNameVariants(name) {
    const cleanName = name
      .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
      .trim();

    const parts = cleanName.split(' ');
    if (parts.length < 2) return [cleanName];

    const firstName = parts[0];
    const restOfName = parts.slice(1).join(' ');
    const variants = [cleanName];

    // Common nickname -> full name mappings
    const nicknameMap = {
      'will': 'William',
      'bill': 'William',
      'bob': 'Robert',
      'rob': 'Robert',
      'mike': 'Michael',
      'jim': 'James',
      'joe': 'Joseph',
      'tom': 'Thomas',
      'dan': 'Daniel',
      'dave': 'David',
      'ed': 'Edward',
      'ted': 'Edward',
      'ben': 'Benjamin',
      'matt': 'Matthew',
      'chris': 'Christopher',
      'alex': 'Alexander',
      'nick': 'Nicholas',
      'tony': 'Anthony',
      'steve': 'Steven',
      'tim': 'Timothy',
      'sam': 'Samuel',
      'andy': 'Andrew',
      'drew': 'Andrew',
      'pete': 'Peter',
      'pat': 'Patrick',
      'greg': 'Gregory',
      'phil': 'Philip',
      'ken': 'Kenneth',
      'kate': 'Katherine',
      'kathy': 'Katherine',
      'cathy': 'Catherine',
      'liz': 'Elizabeth',
      'beth': 'Elizabeth',
      'sue': 'Susan',
      'jenny': 'Jennifer',
      'jen': 'Jennifer',
      'meg': 'Margaret',
      'maggie': 'Margaret',
      'peg': 'Margaret',
      'sally': 'Sarah',
      'vicky': 'Victoria',
      'vic': 'Victoria',
      'nicky': 'Nicole'
    };

    // Try full name if we have a nickname
    const lowerFirst = firstName.toLowerCase();
    if (nicknameMap[lowerFirst]) {
      variants.push(`${nicknameMap[lowerFirst]} ${restOfName}`);
    }

    // Try initial + last name (common in PubMed)
    if (firstName.length > 1) {
      variants.push(`${firstName[0]} ${restOfName}`);
    }

    return variants;
  }

  /**
   * Build a disambiguated author query using expertise areas
   * This helps find the right "Jessica Green" by including topic keywords
   */
  static buildDisambiguatedAuthorQuery(suggestion) {
    const cleanName = suggestion.name
      .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
      .trim();

    const cutoffYear = new Date().getFullYear() - this.YEARS_LOOKBACK;

    // Get expertise keywords (take first 2-3 terms)
    let expertiseTerms = [];
    if (suggestion.expertiseAreas && Array.isArray(suggestion.expertiseAreas)) {
      expertiseTerms = suggestion.expertiseAreas
        .slice(0, 2)
        .map(e => e.split(/[\s,]+/).slice(0, 2).join(' ')) // Take first 2 words of each
        .filter(e => e.length > 2);
    }

    // Build query: name + expertise terms
    if (expertiseTerms.length > 0) {
      const expertiseQuery = expertiseTerms
        .map(term => `(${term}[Title/Abstract])`)
        .join(' OR ');
      return `${cleanName}[Author] AND (${expertiseQuery}) AND (${cutoffYear}:${new Date().getFullYear()}[pdat])`;
    }

    // Fallback to just name
    return `${cleanName}[Author] AND (${cutoffYear}:${new Date().getFullYear()}[pdat])`;
  }

  /**
   * Filter articles by expertise relevance
   * Checks if article titles/abstracts contain expertise keywords
   */
  static filterByExpertiseRelevance(articles, expertiseAreas) {
    if (!expertiseAreas || !Array.isArray(expertiseAreas) || expertiseAreas.length === 0) {
      return articles;
    }

    // Extract keywords from expertise areas
    const keywords = expertiseAreas
      .flatMap(area => area.toLowerCase().split(/[\s,]+/))
      .filter(word => word.length > 3); // Ignore short words

    if (keywords.length === 0) {
      return articles;
    }

    return articles.filter(article => {
      const searchText = `${article.title || ''} ${article.abstract || ''}`.toLowerCase();
      // Article must match at least one keyword
      return keywords.some(keyword => searchText.includes(keyword));
    });
  }

  /**
   * Calculate how well the found articles match the expected expertise
   * Returns a confidence score from 0 to 1
   *
   * More lenient matching for scientific terminology:
   * - Accepts single significant keyword matches
   * - Expands common scientific synonyms
   * - Gives partial credit for related terms
   */
  static calculateExpertiseMatch(articles, expertiseAreas) {
    if (!expertiseAreas || !Array.isArray(expertiseAreas) || expertiseAreas.length === 0) {
      return 0.5; // Unknown confidence - benefit of the doubt
    }

    if (articles.length === 0) {
      return 0;
    }

    // Common scientific synonyms to expand matching
    const synonyms = {
      'viral': ['virus', 'virology', 'viruses', 'phage', 'bacteriophage'],
      'virus': ['viral', 'virology', 'viruses', 'phage'],
      'virology': ['viral', 'virus', 'viruses'],
      'ecology': ['ecological', 'ecosystem', 'ecological'],
      'ecological': ['ecology', 'ecosystem'],
      'marine': ['ocean', 'oceanic', 'aquatic', 'sea'],
      'ocean': ['marine', 'oceanic', 'aquatic', 'sea'],
      'microbial': ['microbe', 'microbiome', 'bacterial', 'bacteria'],
      'microbe': ['microbial', 'microbiome', 'bacterial'],
      'bacteria': ['bacterial', 'microbial', 'microbe'],
      'bacterial': ['bacteria', 'microbial', 'microbe'],
      'evolution': ['evolutionary', 'evolve', 'evolved'],
      'evolutionary': ['evolution', 'evolve'],
      'phage': ['bacteriophage', 'viral', 'virus'],
      'bacteriophage': ['phage', 'viral', 'virus'],
      'population': ['populations', 'community', 'communities'],
      'community': ['communities', 'population', 'populations'],
      'dynamics': ['dynamic', 'interactions', 'interaction'],
      'modeling': ['model', 'models', 'mathematical', 'computational'],
      'model': ['modeling', 'models', 'mathematical'],
      'quantitative': ['mathematical', 'computational', 'modeling']
    };

    // Extract all unique keywords from expertise areas (with synonyms)
    const allKeywords = new Set();
    for (const area of expertiseAreas) {
      const words = area.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
      for (const word of words) {
        allKeywords.add(word);
        // Add synonyms
        if (synonyms[word]) {
          synonyms[word].forEach(syn => allKeywords.add(syn));
        }
      }
    }

    const keywordArray = Array.from(allKeywords);

    // Count articles that match ANY keyword (more lenient)
    let matchingArticles = 0;
    let totalKeywordMatches = 0;

    for (const article of articles) {
      const searchText = `${article.title || ''} ${article.abstract || ''}`.toLowerCase();
      const matchedKeywords = keywordArray.filter(kw => searchText.includes(kw));

      if (matchedKeywords.length > 0) {
        matchingArticles++;
        totalKeywordMatches += matchedKeywords.length;
      }
    }

    // Calculate confidence:
    // - Base: percentage of articles with at least one keyword match
    // - Bonus: average keyword matches per article (capped at +20%)
    const baseConfidence = matchingArticles / articles.length;
    const avgMatches = totalKeywordMatches / articles.length;
    const bonus = Math.min(0.2, avgMatches * 0.05); // 5% per avg match, max 20% bonus

    const confidence = Math.min(1, baseConfidence + bonus);
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Extract the best affiliation from a list of articles for a specific author
   *
   * Uses the MOST COMMON affiliation across all papers, not the most recent.
   * This handles cases where a researcher has a visiting position that appears
   * in one recent paper but their primary affiliation is different.
   *
   * @param {Array} articles - List of articles from PubMed
   * @param {string} authorName - The name of the author to find affiliation for
   * @returns {string|null} The author's affiliation, or null if not found
   */
  static extractBestAffiliation(articles, authorName = null) {
    if (!authorName) {
      // Fallback: return any affiliation from most recent article
      const sortedArticles = [...articles].sort((a, b) => (b.year || 0) - (a.year || 0));
      for (const article of sortedArticles) {
        if (article.authors) {
          for (const author of article.authors) {
            if (author.affiliation && author.affiliation.length > 10) {
              return author.affiliation;
            }
          }
        }
      }
      return null;
    }

    const normalizedSearchName = this.normalizeNameForMatch(authorName);

    // Collect all affiliations for this author across all papers
    const affiliationCounts = new Map();

    for (const article of articles) {
      if (!article.authors) continue;

      for (const author of article.authors) {
        const normalizedAuthorName = this.normalizeNameForMatch(author.name);

        if (this.namesMatch(normalizedSearchName, normalizedAuthorName)) {
          if (author.affiliation && author.affiliation.length > 10) {
            // Normalize affiliation for comparison (extract institution name)
            const normalizedAff = this.normalizeAffiliationForComparison(author.affiliation);
            const count = affiliationCounts.get(normalizedAff) || { count: 0, fullText: author.affiliation };
            count.count++;
            affiliationCounts.set(normalizedAff, count);
          }
        }
      }
    }

    if (affiliationCounts.size === 0) {
      return null;
    }

    // Return the most common affiliation
    let bestAffiliation = null;
    let bestCount = 0;

    for (const [, data] of affiliationCounts) {
      if (data.count > bestCount) {
        bestCount = data.count;
        bestAffiliation = data.fullText;
      }
    }

    return bestAffiliation;
  }

  /**
   * Normalize affiliation string for comparison
   * Extracts the core institution name to group similar affiliations
   */
  static normalizeAffiliationForComparison(affiliation) {
    if (!affiliation) return '';

    // Convert to lowercase
    let normalized = affiliation.toLowerCase();

    // Remove common suffixes like email addresses, department details
    normalized = normalized.replace(/\s*\.\s*\S+@\S+/g, ''); // Remove emails
    normalized = normalized.replace(/,?\s*(usa|united states|uk|france|germany|canada)\.?$/i, ''); // Remove country

    // Extract university/institution name (usually first part before comma or department)
    // Look for patterns like "University of X" or "X University" or "X Institute"
    const uniMatch = normalized.match(/(university of [^,]+|[^,]+ university|[^,]+ institute of technology|[^,]+ institute)/i);
    if (uniMatch) {
      return uniMatch[1].trim();
    }

    // Fallback: take first 50 chars
    return normalized.substring(0, 50).trim();
  }

  /**
   * Extract the best affiliation trying multiple name variants
   * Useful when searching for Will/William/W Harcombe
   */
  static extractBestAffiliationMultiVariant(articles, nameVariants) {
    if (!nameVariants || nameVariants.length === 0) {
      return this.extractBestAffiliation(articles, null);
    }

    // Try each variant, return first match
    for (const variant of nameVariants) {
      const affiliation = this.extractBestAffiliation(articles, variant);
      if (affiliation) {
        return affiliation;
      }
    }

    // Fallback to any affiliation
    return this.extractBestAffiliation(articles, null);
  }

  /**
   * Filter articles to only include those where the target author is actually in the author list
   * This is critical to handle stale/incorrect cache data
   */
  static filterToMatchingAuthor(articles, targetName) {
    if (!articles || !targetName) return [];

    const normalizedTarget = this.normalizeNameForMatch(targetName);

    return articles.filter(article => {
      if (!article.authors) return false;

      // Check if the target author is in this article's author list
      return article.authors.some(author => {
        const normalizedAuthor = this.normalizeNameForMatch(author.name);
        return this.namesMatch(normalizedTarget, normalizedAuthor);
      });
    });
  }

  /**
   * Filter articles to include those where ANY of the name variants match an author
   * Used when searching for nickname variants (Will/William/W Harcombe)
   */
  static filterToMatchingAuthorMultiVariant(articles, nameVariants) {
    if (!articles || !nameVariants || nameVariants.length === 0) return [];

    const normalizedVariants = nameVariants.map(v => this.normalizeNameForMatch(v));

    return articles.filter(article => {
      if (!article.authors) return false;

      return article.authors.some(author => {
        const normalizedAuthor = this.normalizeNameForMatch(author.name);
        // Match if ANY variant matches this author
        return normalizedVariants.some(variant =>
          this.namesMatch(variant, normalizedAuthor)
        );
      });
    });
  }

  /**
   * Normalize a name for matching (lowercase, remove titles, etc.)
   */
  static normalizeNameForMatch(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/^(dr\.?|prof\.?|professor)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if two names match (handles initials, partial names)
   * More strict matching to avoid confusion between different people
   */
  static namesMatch(name1, name2) {
    if (!name1 || !name2) return false;
    if (name1 === name2) return true;

    const parts1 = name1.split(' ');
    const parts2 = name2.split(' ');

    // Get last names
    const lastName1 = parts1[parts1.length - 1];
    const lastName2 = parts2[parts2.length - 1];

    // Last names must match
    if (lastName1 !== lastName2) return false;

    // Check first names/initials
    const first1 = parts1[0] || '';
    const first2 = parts2[0] || '';

    // Exact match
    if (first1 === first2) return true;

    // Initial match - ONLY if one is actually an initial (1-2 chars)
    // "J" matches "John", "W" matches "William", but "Will" does NOT match "Helen"
    if (first1.length <= 2 && first2.toLowerCase().startsWith(first1.toLowerCase())) return true;
    if (first2.length <= 2 && first1.toLowerCase().startsWith(first2.toLowerCase())) return true;

    // Handle middle initials: "W R" matches "William" (just check first initial)
    const firstInitial1 = first1[0]?.toLowerCase();
    const firstInitial2 = first2[0]?.toLowerCase();
    if (firstInitial1 && firstInitial2 && firstInitial1 === firstInitial2) {
      // If first initials match, check if either has a middle initial that matches the other's first name
      // This handles "W R Harcombe" matching "William Harcombe"
      if (parts1.length === 3 && parts2.length === 2) {
        // name1 has middle initial, name2 doesn't
        return true;
      }
      if (parts2.length === 3 && parts1.length === 2) {
        // name2 has middle initial, name1 doesn't
        return true;
      }
    }

    // Do NOT match different first names like "Will" and "Helen"
    return false;
  }

  /**
   * Count publications in the last N years
   */
  static countRecentPublications(articles) {
    const cutoffYear = new Date().getFullYear() - this.YEARS_LOOKBACK;
    return articles.filter(a => (a.year || 0) >= cutoffYear).length;
  }

  /**
   * Check for coauthorship history between a candidate and proposal authors
   *
   * @param {string} candidateName - Name of the reviewer candidate
   * @param {string[]} proposalAuthors - List of proposal author names
   * @returns {Promise<Object>} Coauthorship information
   */
  static async checkCoauthorHistory(candidateName, proposalAuthors) {
    if (!proposalAuthors || proposalAuthors.length === 0) {
      return { hasCoauthorship: false, coauthorships: [] };
    }

    const coauthorships = [];

    for (const proposalAuthor of proposalAuthors) {
      const cleanAuthorName = proposalAuthor
        .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
        .trim();

      if (!cleanAuthorName || cleanAuthorName.toLowerCase() === 'not specified') {
        continue;
      }

      // Convert names to PubMed format: "LastName FirstInitial" works best
      const candidatePubmedName = this.toPubMedAuthorFormat(candidateName);
      const authorPubmedName = this.toPubMedAuthorFormat(cleanAuthorName);

      // Search PubMed for papers coauthored by both
      // Use format: "LastName FI[Author]" which is more reliable
      const query = `${candidatePubmedName}[Author] AND ${authorPubmedName}[Author]`;

      try {
        const articles = await PubMedService.search(query, 10);

        if (articles && articles.length > 0) {
          coauthorships.push({
            proposalAuthor: proposalAuthor,
            paperCount: articles.length,
            recentPapers: articles.slice(0, 3).map(a => ({
              title: a.title,
              year: a.year,
              pmid: a.pmid,
              url: a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}` : null
            }))
          });
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, PUBMED_DELAY));
      } catch (error) {
        console.warn(`Error checking coauthorship for ${candidateName} & ${proposalAuthor}:`, error.message);
      }
    }

    return {
      hasCoauthorship: coauthorships.length > 0,
      coauthorships
    };
  }

  /**
   * Convert a name to PubMed author search format
   * "Forest Rohwer" -> "Rohwer F"
   * "Dr. Mya Breitbart" -> "Breitbart M"
   */
  static toPubMedAuthorFormat(name) {
    const cleanName = name
      .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
      .trim();

    const parts = cleanName.split(/\s+/);
    if (parts.length < 2) {
      return cleanName; // Return as-is if can't parse
    }

    // Get last name (last part)
    const lastName = parts[parts.length - 1];
    // Get first initial
    const firstInitial = parts[0][0].toUpperCase();

    return `${lastName} ${firstInitial}`;
  }

  /**
   * Check coauthorship for multiple candidates in parallel (with rate limiting)
   *
   * @param {Array} candidates - List of verified candidates
   * @param {string[]} proposalAuthors - List of proposal author names
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} Candidates with coauthorship info added
   */
  static async checkCoauthorshipsForCandidates(candidates, proposalAuthors, onProgress = () => {}) {
    if (!proposalAuthors || proposalAuthors.length === 0) {
      return candidates;
    }

    const results = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];

      onProgress({
        stage: 'coi_check',
        status: 'checking',
        message: `Checking COI for ${candidate.name} (${i + 1}/${candidates.length})...`
      });

      const coauthorInfo = await this.checkCoauthorHistory(candidate.name, proposalAuthors);

      results.push({
        ...candidate,
        coauthorships: coauthorInfo.coauthorships,
        hasCoauthorCOI: coauthorInfo.hasCoauthorship
      });
    }

    return results;
  }

  /**
   * Combine and rank all candidates
   *
   * @param {Object} discoveryResults - Results from discover()
   * @param {string[]} keywords - Proposal keywords for relevance scoring
   * @returns {Array} Ranked list of all candidates
   */
  static rankAllCandidates(discoveryResults, keywords = []) {
    const { verified, discovered } = discoveryResults;

    // Combine all candidates
    const allCandidates = [
      ...verified.map(c => ({ ...c, isClaudeSuggestion: true })),
      ...discovered.map(c => ({ ...c, isClaudeSuggestion: false }))
    ];

    // Use deduplication service's ranking
    return DeduplicationService.rankByRelevance(allCandidates, keywords);
  }
}

module.exports = { DiscoveryService };
