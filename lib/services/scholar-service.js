/**
 * ScholarService - Search Google Scholar via SerpAPI
 *
 * Uses SerpAPI for Google Scholar:
 * - Requires SERP_API_KEY environment variable
 * - Returns author profiles with h-index, citations, interests
 * - Paid service with generous free tier
 */

const { DatabaseService } = require('./database-service');

class ScholarService {
  static apiKey = process.env.SERP_API_KEY;
  static baseUrl = 'https://serpapi.com/search.json';

  // ============================================
  // SEARCH WITH CACHING
  // ============================================

  /**
   * Search for Google Scholar author profiles
   */
  static async searchAuthors(query, maxResults = 20) {
    if (!this.apiKey) {
      console.log('ScholarService: No SERP_API_KEY configured, skipping Google Scholar');
      return [];
    }

    // Check cache
    const cacheKey = `authors:${query}`;
    const cached = await DatabaseService.checkCache('scholar', cacheKey);
    if (cached) {
      console.log('Google Scholar cache hit for:', query.substring(0, 50) + '...');
      return cached;
    }

    console.log('Querying Google Scholar for authors:', query.substring(0, 50) + '...');

    try {
      const params = new URLSearchParams({
        engine: 'google_scholar_profiles',
        mauthors: query,
        api_key: this.apiKey,
      });

      const url = `${this.baseUrl}?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SerpAPI error:', response.status, response.statusText);
        console.error('SerpAPI error details:', errorText.substring(0, 500));
        return [];
      }

      const data = await response.json();
      const profiles = [];

      // Process each profile found
      const authorProfiles = (data.profiles || []).slice(0, maxResults);

      for (const profile of authorProfiles) {
        // Fetch detailed profile for each author
        const detailedProfile = await this.fetchAuthorProfile(profile.author_id);
        if (detailedProfile) {
          profiles.push(detailedProfile);
        }

        // Rate limit between profile fetches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await this.cacheResults(cacheKey, profiles);
      return profiles;

    } catch (error) {
      console.error('Scholar search error:', error.message);
      return [];
    }
  }

  /**
   * Fetch detailed profile for a specific author
   */
  static async fetchAuthorProfile(authorId) {
    if (!this.apiKey || !authorId) return null;

    // Check cache for individual profile
    const cacheKey = `profile:${authorId}`;
    const cached = await DatabaseService.checkCache('scholar', cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const params = new URLSearchParams({
        engine: 'google_scholar_author',
        author_id: authorId,
        api_key: this.apiKey,
      });

      const url = `${this.baseUrl}?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error('SerpAPI author fetch error:', response.status);
        return null;
      }

      const data = await response.json();

      const author = data.author || {};
      const citations = data.cited_by || {};
      const articles = data.articles || [];

      // Extract citation metrics from table
      const citationTable = citations.table || [];
      const allCitations = citationTable.find(row => row.citations)?.citations?.all || 0;
      const hIndex = citationTable.find(row => row.h_index)?.h_index?.all || 0;
      const i10Index = citationTable.find(row => row.i10_index)?.i10_index?.all || 0;

      const profile = {
        name: author.name || '',
        affiliation: author.affiliations || '',
        scholarId: authorId,
        email: author.email || '',
        website: author.website || '',
        thumbnailUrl: author.thumbnail || '',
        hIndex: hIndex,
        i10Index: i10Index,
        totalCitations: allCitations,
        interests: (author.interests || []).map(i => i.title || i).filter(Boolean),
        recentPublications: articles.slice(0, 10).map((article) => ({
          title: article.title || '',
          authors: article.authors || '',
          year: parseInt(article.year, 10) || null,
          citations: parseInt(article.cited_by?.value, 10) || 0,
          link: article.link || '',
        })),
      };

      // Cache individual profile for 3 months
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3);
      await DatabaseService.cacheSearch({
        source: 'scholar',
        query: cacheKey,
        results: profile,
        expiresAt,
      });

      return profile;

    } catch (error) {
      console.error('Error fetching author profile:', error.message);
      return null;
    }
  }

  /**
   * Search for articles (not profiles) on Google Scholar
   */
  static async searchArticles(query, maxResults = 50) {
    if (!this.apiKey) {
      console.log('ScholarService: No SERP_API_KEY configured, skipping');
      return [];
    }

    const cacheKey = `articles:${query}`;
    const cached = await DatabaseService.checkCache('scholar', cacheKey);
    if (cached) {
      console.log('Google Scholar articles cache hit');
      return cached;
    }

    try {
      const params = new URLSearchParams({
        engine: 'google_scholar',
        q: query,
        num: Math.min(maxResults, 20).toString(), // Max 20 per page
        api_key: this.apiKey,
      });

      const url = `${this.baseUrl}?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error('SerpAPI articles error:', response.status);
        return [];
      }

      const data = await response.json();
      const organicResults = data.organic_results || [];

      const articles = organicResults.map((result) => ({
        title: result.title || '',
        link: result.link || '',
        snippet: result.snippet || '',
        authors: this.parseAuthorsFromSnippet(result.publication_info?.summary || ''),
        year: this.parseYearFromSnippet(result.publication_info?.summary || ''),
        citations: result.inline_links?.cited_by?.total || 0,
        source: 'scholar',
      }));

      // Cache for 6 months
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 6);
      await DatabaseService.cacheSearch({
        source: 'scholar',
        query: cacheKey,
        results: articles,
        expiresAt,
      });

      return articles;

    } catch (error) {
      console.error('Scholar articles search error:', error.message);
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
      source: 'scholar',
      query,
      results,
      expiresAt,
    });
  }

  // ============================================
  // QUERY GENERATORS
  // ============================================

  /**
   * Generate a Google Scholar query from proposal metadata
   */
  static generateQuery(metadata) {
    const parts = [];

    if (metadata.primaryResearchArea && metadata.primaryResearchArea !== 'Not specified') {
      parts.push(metadata.primaryResearchArea);
    }

    if (metadata.keyMethodologies && metadata.keyMethodologies !== 'Not specified') {
      parts.push(metadata.keyMethodologies);
    }

    // Scholar has shorter query limits
    return parts.join(' ').slice(0, 100);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Parse authors from publication info snippet
   */
  static parseAuthorsFromSnippet(snippet) {
    if (!snippet) return [];
    // Format is usually "Author1, Author2, Author3 - Journal, Year"
    const parts = snippet.split(' - ');
    if (parts.length > 0) {
      return parts[0].split(',').map(a => a.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Parse year from publication info snippet
   */
  static parseYearFromSnippet(snippet) {
    if (!snippet) return null;
    const yearMatch = snippet.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0], 10) : null;
  }

  /**
   * Check if SerpAPI is configured
   */
  static isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = { ScholarService };
