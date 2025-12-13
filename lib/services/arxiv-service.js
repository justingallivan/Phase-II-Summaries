/**
 * ArXivService - Search ArXiv for preprints
 *
 * Uses ArXiv API (Atom feed):
 * - Rate limit: 3 second delay between requests
 * - Returns preprints in physics, math, CS, biology, etc.
 */

const { DatabaseService } = require('./database-service');
const { parseStringPromise } = require('xml2js');

class ArXivService {
  static baseUrl = 'http://export.arxiv.org/api/query';

  // ============================================
  // SEARCH (WITH OPTIONAL CACHING)
  // ============================================

  /**
   * Search ArXiv for articles matching a query
   *
   * @param {string} query - ArXiv search query
   * @param {number} maxResults - Maximum results to return
   * @param {Object} options - Search options
   * @param {boolean} options.useCache - Whether to use cache (default: false for free API)
   */
  static async search(query, maxResults = 100, options = {}) {
    const { useCache = false } = options;

    // Only check cache if explicitly requested
    if (useCache) {
      const cached = await DatabaseService.checkCache('arxiv', query);
      if (cached) {
        console.log('ArXiv cache hit for:', query.substring(0, 50) + '...');
        return cached;
      }
    }

    console.log('Querying ArXiv API for:', query.substring(0, 50) + '...');

    try {
      const params = new URLSearchParams({
        search_query: `all:${query}`,
        start: '0',
        max_results: maxResults.toString(),
        sortBy: 'relevance',
        sortOrder: 'descending',
      });

      const url = `${this.baseUrl}?${params}`;

      // Rate limit: ArXiv requires 3 second delay between requests
      await new Promise(resolve => setTimeout(resolve, 3000));

      const response = await fetch(url);
      const xml = await response.text();

      const articles = await this.parseXML(xml);

      // Only cache if explicitly requested
      if (useCache) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        await DatabaseService.cacheSearch({
          source: 'arxiv',
          query,
          results: articles,
          expiresAt,
        });
      }

      return articles;
    } catch (error) {
      console.error('ArXiv search error:', error.message);
      return [];
    }
  }

  /**
   * Parse ArXiv Atom feed XML
   */
  static async parseXML(xml) {
    try {
      const result = await parseStringPromise(xml);
      const entries = result.feed?.entry || [];

      return entries.map((entry) => {
        // Extract arXiv ID from the id URL
        const idUrl = entry.id?.[0] || '';
        const arxivId = idUrl.split('/abs/').pop()?.split('v')[0] || '';

        // Title
        const title = (entry.title?.[0] || '').trim().replace(/\n/g, ' ');

        // Authors - only the last author (typically the PI/senior author)
        const authorList = entry.author || [];
        const allAuthors = authorList.map((author) => (author.name?.[0] || '').trim()).filter(Boolean);
        const authors = [];
        if (allAuthors.length > 0) {
          authors.push(allAuthors[allAuthors.length - 1]); // Last author (PI)
        }

        // Abstract
        const abstract = (entry.summary?.[0] || '').trim().replace(/\n/g, ' ');

        // Publication date
        const published = entry.published?.[0] || '';
        const publicationDate = published ? new Date(published) : null;
        const year = publicationDate ? publicationDate.getFullYear() : null;

        // Categories
        const categoryList = entry.category || [];
        const categories = categoryList.map((cat) => cat.$?.term).filter(Boolean);

        // DOI (if available)
        const doi = entry['arxiv:doi']?.[0]?._ || entry['arxiv:doi']?.[0] || null;

        // Primary category
        const primaryCategory = entry['arxiv:primary_category']?.[0]?.$?.term || categories[0] || '';

        return {
          arxivId,
          title,
          authors,
          abstract,
          publicationDate,
          year,
          categories,
          primaryCategory,
          doi,
        };
      }).filter(article => article.arxivId && article.title);
    } catch (error) {
      console.error('ArXiv XML parse error:', error.message);
      return [];
    }
  }

  // ============================================
  // QUERY GENERATORS
  // ============================================

  /**
   * Generate an ArXiv search query from proposal metadata
   * Keep queries focused - ArXiv works better with shorter, specific queries
   */
  static generateQuery(metadata) {
    // Use only the primary research area - keep it simple
    const researchArea = metadata.primaryResearchArea;
    if (!researchArea || researchArea === 'Not specified') {
      return null;
    }

    // Extract key terms (first 3-4 words to avoid overly broad searches)
    const terms = researchArea.split(/[\s,]+/).slice(0, 4).join(' ');
    return terms;
  }

  /**
   * Build a proper ArXiv query string with field specifiers
   */
  static buildQueryString(metadata) {
    const parts = [];

    // Primary research area in title or abstract
    if (metadata.primaryResearchArea && metadata.primaryResearchArea !== 'Not specified') {
      const area = metadata.primaryResearchArea.split(/[\s,]+/).slice(0, 3).join(' ');
      parts.push(`(ti:"${area}" OR abs:"${area}")`);
    }

    // Add category filter if we can map it
    const category = this.mapToArXivCategories(metadata.primaryResearchArea || '');
    if (category) {
      parts.push(`cat:${category}*`);
    }

    return parts.join(' AND ');
  }

  /**
   * Map research areas to ArXiv categories
   */
  static mapToArXivCategories(researchArea) {
    const categoryMap = {
      'machine learning': 'cs.LG',
      'artificial intelligence': 'cs.AI',
      'computer vision': 'cs.CV',
      'natural language processing': 'cs.CL',
      'neuroscience': 'q-bio.NC',
      'computational biology': 'q-bio.QM',
      'bioinformatics': 'q-bio.GN',
      'biology': 'q-bio',
      'microbiology': 'q-bio',
      'virology': 'q-bio',
      'ecology': 'q-bio.PE',
      'evolution': 'q-bio.PE',
      'genomics': 'q-bio.GN',
      'physics': 'physics',
      'mathematics': 'math',
      'statistics': 'stat',
      'quantum computing': 'quant-ph',
      'robotics': 'cs.RO',
    };

    const lower = researchArea.toLowerCase();
    for (const [key, value] of Object.entries(categoryMap)) {
      if (lower.includes(key)) {
        return value;
      }
    }
    return null;
  }
}

module.exports = { ArXivService };
