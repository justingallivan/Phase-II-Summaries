/**
 * ChemRxivService - Search ChemRxiv for chemistry preprints
 *
 * Uses ChemRxiv Public API:
 * - Base URL: https://chemrxiv.org/engage/chemrxiv/public-api/v1
 * - Supports keyword search via 'term' parameter
 * - Returns authors with ORCID and institution data
 * - Rate limit: 429 response indicates throttling needed
 */

const { DatabaseService } = require('./database-service');

class ChemRxivService {
  static baseUrl = 'https://chemrxiv.org/engage/chemrxiv/public-api/v1';

  // ============================================
  // SEARCH (WITH OPTIONAL CACHING)
  // ============================================

  /**
   * Search ChemRxiv for articles matching a query
   *
   * @param {string} query - Search query (keywords)
   * @param {number} maxResults - Maximum results to return (max 50 per request)
   * @param {Object} options - Search options
   * @param {boolean} options.useCache - Whether to use cache (default: false)
   */
  static async search(query, maxResults = 50, options = {}) {
    const { useCache = false } = options;

    // Only check cache if explicitly requested
    if (useCache) {
      const cached = await DatabaseService.checkCache('chemrxiv', query);
      if (cached) {
        console.log('ChemRxiv cache hit for:', query.substring(0, 50) + '...');
        return cached;
      }
    }

    console.log('Querying ChemRxiv API for:', query.substring(0, 50) + '...');

    try {
      // ChemRxiv supports direct keyword search
      const params = new URLSearchParams({
        term: query,
        limit: Math.min(maxResults, 50).toString(), // API max is 50
        skip: '0',
        sort: 'RELEVANT' // Sort by relevance
      });

      // Search for published items from last 3 years
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      params.append('searchDateFrom', threeYearsAgo.toISOString().split('T')[0]);

      const url = `${this.baseUrl}/items?${params}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 429) {
        console.error('ChemRxiv API rate limited, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Retry once
        const retryResponse = await fetch(url);
        if (!retryResponse.ok) {
          console.error('ChemRxiv API retry failed:', retryResponse.status);
          return [];
        }
        return this.parseResponse(await retryResponse.json(), maxResults);
      }

      if (!response.ok) {
        console.error('ChemRxiv API error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      const articles = this.parseResponse(data, maxResults);

      // Only cache if explicitly requested
      if (useCache && articles.length > 0) {
        await this.cacheResults(query, articles);
      }

      return articles;

    } catch (error) {
      console.error('ChemRxiv search error:', error.message);
      return [];
    }
  }

  /**
   * Parse ChemRxiv API response into standardized format
   */
  static parseResponse(data, maxResults) {
    // ChemRxiv returns { itemHits: [...] } for search results
    const items = data.itemHits || data.items || [];

    if (!items || items.length === 0) {
      return [];
    }

    return items.slice(0, maxResults).map((hit) => {
      // itemHits wraps items in { item: {...} }
      const article = hit.item || hit;

      // Extract authors - ChemRxiv provides detailed author info
      const authors = (article.authors || []).map(author => {
        const name = author.firstName && author.lastName
          ? `${author.firstName} ${author.lastName}`.trim()
          : author.name || '';
        return name;
      }).filter(name => name.length > 0);

      // Get corresponding author (usually first author or marked)
      const correspondingAuthor = authors.length > 0 ? authors[0] : '';

      // Extract institution from first author if available
      const firstAuthor = (article.authors || [])[0];
      const institution = firstAuthor?.institutions?.[0]?.name || '';

      return {
        id: article.id || '',
        doi: article.doi || '',
        title: article.title || '',
        authors: authors,
        abstract: article.abstract || '',
        publicationDate: article.publishedDate ? new Date(article.publishedDate) : null,
        year: article.publishedDate ? new Date(article.publishedDate).getFullYear() : null,
        category: article.categories?.[0]?.name || '',
        keywords: (article.keywords || []).join(', '),
        institution: institution,
        correspondingAuthor: correspondingAuthor,
        source: 'chemrxiv'
      };
    });
  }

  /**
   * Cache search results
   */
  static async cacheResults(query, results) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    await DatabaseService.cacheSearch({
      source: 'chemrxiv',
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
   */
  static generateQuery(metadata) {
    const researchArea = metadata.primaryResearchArea;
    if (!researchArea || researchArea === 'Not specified') {
      return null;
    }

    // Use research area keywords for search
    // ChemRxiv API handles keyword search well
    const terms = researchArea.split(/[\s,]+/).slice(0, 5).join(' ');
    return terms;
  }

  /**
   * Check if a research area is relevant for ChemRxiv
   * ChemRxiv focuses on chemistry
   */
  static isRelevantForChemRxiv(researchArea) {
    if (!researchArea) return false;

    const lower = researchArea.toLowerCase();
    const chemKeywords = [
      'chemistry', 'chemical', 'organic', 'inorganic', 'biochem',
      'polymer', 'catalysis', 'catalyst', 'synthesis', 'synthetic',
      'molecular', 'molecule', 'compound', 'reaction', 'reagent',
      'spectroscopy', 'electrochemistry', 'photochemistry', 'nanochemistry',
      'medicinal chemistry', 'pharmaceutical', 'drug', 'ligand',
      'crystal', 'materials', 'nanoparticle', 'surface chemistry',
      'analytical', 'chromatography', 'mass spectrometry',
      'computational chemistry', 'quantum chemistry', 'theoretical chemistry',
      'supramolecular', 'coordination', 'organometallic',
      'gasotransmitter', 'cyanide', 'sulfide', 'hydrogen'
    ];

    return chemKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Search for articles by a specific author
   *
   * @param {string} authorName - Author name to search for
   * @param {number} maxResults - Maximum results to return
   */
  static async searchByAuthor(authorName, maxResults = 20) {
    console.log('ChemRxiv author search for:', authorName);

    try {
      const params = new URLSearchParams({
        term: `"${authorName}"`, // Quote for exact phrase
        limit: Math.min(maxResults, 50).toString(),
        skip: '0',
        sort: 'PUBLISHED_DATE'
      });

      const url = `${this.baseUrl}/items?${params}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('ChemRxiv author search error:', response.status);
        return [];
      }

      const data = await response.json();
      const articles = this.parseResponse(data, maxResults);

      // Filter to only include articles where the author is actually listed
      const lowerName = authorName.toLowerCase();
      return articles.filter(article =>
        article.authors.some(author =>
          author.toLowerCase().includes(lowerName.split(' ').pop()) // Match last name
        )
      );

    } catch (error) {
      console.error('ChemRxiv author search error:', error.message);
      return [];
    }
  }
}

module.exports = { ChemRxivService };
