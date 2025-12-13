/**
 * BioRxivService - Search BioRxiv for preprints in life sciences
 *
 * Uses BioRxiv API:
 * - Returns preprints by date range
 * - Client-side filtering by keywords
 * - Rate limit: 1 request per 5 seconds recommended
 */

const { DatabaseService } = require('./database-service');

class BioRxivService {
  static baseUrl = 'https://api.biorxiv.org/details/biorxiv';

  // ============================================
  // SEARCH (WITH OPTIONAL CACHING)
  // ============================================

  /**
   * Search BioRxiv for articles matching a query
   *
   * @param {string} query - Search query (used for client-side filtering)
   * @param {number} maxResults - Maximum results to return
   * @param {Object} options - Search options
   * @param {boolean} options.useCache - Whether to use cache (default: false for free API)
   */
  static async search(query, maxResults = 100, options = {}) {
    const { useCache = false } = options;

    // Only check cache if explicitly requested
    if (useCache) {
      const cached = await DatabaseService.checkCache('biorxiv', query);
      if (cached) {
        console.log('BioRxiv cache hit for:', query.substring(0, 50) + '...');
        return cached;
      }
    }

    console.log('Querying BioRxiv API for:', query.substring(0, 50) + '...');

    try {
      // BioRxiv API searches by date range, not keywords
      // We'll get recent papers and filter client-side
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 2); // Last 2 years

      const formatDate = (date) => date.toISOString().split('T')[0];

      // BioRxiv API returns paginated results, fetch first batch
      const url = `${this.baseUrl}/${formatDate(startDate)}/${formatDate(endDate)}/0/json`;

      // Rate limit: 1 request per 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));

      const response = await fetch(url);

      if (!response.ok) {
        console.error('BioRxiv API error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      if (!data.collection || data.collection.length === 0) {
        return [];
      }

      // Filter results by query terms
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const filtered = data.collection.filter((article) => {
        const searchText = `${article.title || ''} ${article.abstract || ''} ${article.category || ''}`.toLowerCase();
        // Require at least 2 query terms to match
        const matchCount = queryTerms.filter(term => searchText.includes(term)).length;
        return matchCount >= Math.min(2, queryTerms.length);
      }).slice(0, maxResults);

      const articles = filtered.map((article) => ({
        doi: article.doi || '',
        title: article.title || '',
        // Only include corresponding author (the PI/lab head)
        authors: article.author_corresponding ? [article.author_corresponding.trim()] : [],
        abstract: article.abstract || '',
        publicationDate: article.date ? new Date(article.date) : null,
        year: article.date ? new Date(article.date).getFullYear() : null,
        category: article.category || '',
        institution: article.author_corresponding_institution || '',
        correspondingAuthor: article.author_corresponding || '',
      }));

      // Only cache if explicitly requested
      if (useCache) {
        await this.cacheResults(query, articles);
      }

      return articles;

    } catch (error) {
      console.error('BioRxiv search error:', error.message);
      return [];
    }
  }

  /**
   * Cache search results
   */
  static async cacheResults(query, results) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    await DatabaseService.cacheSearch({
      source: 'biorxiv',
      query,
      results,
      expiresAt,
    });
  }

  // ============================================
  // QUERY GENERATORS
  // ============================================

  /**
   * Generate a search query from proposal metadata
   * BioRxiv uses client-side filtering, so shorter queries work better
   */
  static generateQuery(metadata) {
    const researchArea = metadata.primaryResearchArea;
    if (!researchArea || researchArea === 'Not specified') {
      return null;
    }

    // Use just the first 2-3 key terms for better filtering
    const terms = researchArea.split(/[\s,]+/).slice(0, 3).join(' ');
    return terms;
  }

  /**
   * Check if a research area is relevant for BioRxiv
   * BioRxiv focuses on life sciences
   */
  static isRelevantForBioRxiv(researchArea) {
    if (!researchArea) return false;

    const lower = researchArea.toLowerCase();
    const bioKeywords = [
      'biology', 'biolog', 'genomic', 'genetic', 'cell', 'molecular',
      'neuroscience', 'neuro', 'biochem', 'bioinformatics', 'computational biology',
      'cancer', 'immun', 'patholog', 'pharmacol', 'physiol', 'ecology',
      'evolution', 'microb', 'plant', 'animal', 'disease', 'health',
      'protein', 'dna', 'rna', 'gene', 'genom', 'biomedical'
    ];

    return bioKeywords.some(keyword => lower.includes(keyword));
  }
}

module.exports = { BioRxivService };
