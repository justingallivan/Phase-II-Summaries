/**
 * LiteratureSearchService - Orchestrates academic database searches for Stage 0
 *
 * Searches PubMed, arXiv, bioRxiv, ChemRxiv, and Google Scholar (via SerpAPI)
 * in parallel, then returns normalized results for LLM collation.
 */

const { PubMedService } = require('./pubmed-service');
const { ArXivService } = require('./arxiv-service');
const { BioRxivService } = require('./biorxiv-service');
const { ChemRxivService } = require('./chemrxiv-service');
import { safeFetch } from '../utils/safe-fetch';

const MAX_RESULTS_PER_QUERY = 10;
const MAX_RESULTS_PER_DB = 20;
const SCHOLAR_MAX_PER_QUERY = 5;

export class LiteratureSearchService {

  /**
   * Run all searches in parallel based on extracted claim data.
   *
   * @param {Object} claimData - Output from claim extraction (Stage 0a)
   * @param {string[]} claimData.noveltySearchStrings
   * @param {string[]} claimData.techniqueSearchStrings
   * @param {string[]} claimData.piNames
   * @param {string} claimData.field
   * @returns {Promise<Object>} Raw search results from all databases
   */
  static async searchAll(claimData) {
    const allQueries = [
      ...claimData.noveltySearchStrings || [],
      ...claimData.techniqueSearchStrings || [],
    ].slice(0, 8); // Cap total queries to control API costs

    const piDetails = claimData.piDetails || claimData.piNames?.map(n => ({ name: n })) || [];

    const [pubmed, arxiv, biorxiv, chemrxiv, scholar, piPubs] = await Promise.allSettled([
      this._searchPubMed(allQueries),
      this._searchArXiv(allQueries),
      this._searchBioRxiv(allQueries),
      this._searchChemRxiv(allQueries),
      this._searchGoogleScholar(claimData.noveltySearchStrings || []),
      this._searchPIPubs(piDetails, claimData.field),
    ]);

    return {
      pubmed: this._extractResult(pubmed),
      arxiv: this._extractResult(arxiv),
      biorxiv: this._extractResult(biorxiv),
      chemrxiv: this._extractResult(chemrxiv),
      googleScholar: this._extractResult(scholar),
      piPublications: this._extractResult(piPubs),
      searchQueries: allQueries,
      piNames: piDetails.map(p => p.name || p),
      piDetails,
      field: claimData.field,
    };
  }

  /**
   * Search PubMed across multiple queries, dedup by PMID
   */
  static async _searchPubMed(queries) {
    const seen = new Set();
    const results = [];

    for (const query of queries) {
      try {
        const articles = await PubMedService.search(query, MAX_RESULTS_PER_QUERY);
        for (const article of articles) {
          if (!seen.has(article.pmid)) {
            seen.add(article.pmid);
            results.push({
              source: 'pubmed',
              id: article.pmid,
              title: article.title,
              authors: article.authors?.map(a => a.name).join(', ') || '',
              journal: article.journal,
              year: article.year,
              doi: article.doi,
              abstract: article.abstract?.substring(0, 300) || '',
            });
          }
        }
      } catch (err) {
        console.warn(`[LiteratureSearch] PubMed query failed: "${query}" — ${err.message}`);
      }
    }
    return results.slice(0, MAX_RESULTS_PER_DB);
  }

  /**
   * Search arXiv across multiple queries, dedup by arXiv ID
   */
  static async _searchArXiv(queries) {
    const seen = new Set();
    const results = [];

    for (const query of queries) {
      try {
        const articles = await ArXivService.search(query, MAX_RESULTS_PER_QUERY);
        for (const article of articles) {
          if (!seen.has(article.arxivId)) {
            seen.add(article.arxivId);
            results.push({
              source: 'arxiv',
              id: article.arxivId,
              title: article.title,
              authors: article.authors?.join(', ') || '',
              year: article.year,
              categories: article.categories?.join(', ') || '',
              doi: article.doi,
              abstract: article.abstract?.substring(0, 300) || '',
            });
          }
        }
      } catch (err) {
        console.warn(`[LiteratureSearch] arXiv query failed: "${query}" — ${err.message}`);
      }
    }
    return results.slice(0, MAX_RESULTS_PER_DB);
  }

  /**
   * Search bioRxiv across multiple queries, dedup by DOI
   */
  static async _searchBioRxiv(queries) {
    const seen = new Set();
    const results = [];

    for (const query of queries) {
      try {
        const articles = await BioRxivService.search(query, MAX_RESULTS_PER_QUERY);
        for (const article of articles) {
          if (article.doi && !seen.has(article.doi)) {
            seen.add(article.doi);
            results.push({
              source: 'biorxiv',
              id: article.doi,
              title: article.title,
              authors: article.authors?.join(', ') || article.correspondingAuthor || '',
              year: article.year,
              category: article.category,
              abstract: article.abstract?.substring(0, 300) || '',
            });
          }
        }
      } catch (err) {
        console.warn(`[LiteratureSearch] bioRxiv query failed: "${query}" — ${err.message}`);
      }
    }
    return results.slice(0, MAX_RESULTS_PER_DB);
  }

  /**
   * Search ChemRxiv across multiple queries, dedup by DOI
   */
  static async _searchChemRxiv(queries) {
    const seen = new Set();
    const results = [];

    for (const query of queries) {
      try {
        const articles = await ChemRxivService.search(query, MAX_RESULTS_PER_QUERY);
        for (const article of articles) {
          if (article.doi && !seen.has(article.doi)) {
            seen.add(article.doi);
            results.push({
              source: 'chemrxiv',
              id: article.doi,
              title: article.title,
              authors: article.authors?.join(', ') || '',
              year: article.year,
              keywords: article.keywords,
              abstract: article.abstract?.substring(0, 300) || '',
            });
          }
        }
      } catch (err) {
        console.warn(`[LiteratureSearch] ChemRxiv query failed: "${query}" — ${err.message}`);
      }
    }
    return results.slice(0, MAX_RESULTS_PER_DB);
  }

  /**
   * Search Google Scholar via SerpAPI for novelty claims
   */
  static async _searchGoogleScholar(noveltyQueries) {
    const apiKey = process.env.SERP_API_KEY;
    if (!apiKey) {
      console.warn('[LiteratureSearch] SERP_API_KEY not configured, skipping Google Scholar');
      return [];
    }

    const results = [];
    // Limit to top 4 novelty queries to control API costs
    for (const query of noveltyQueries.slice(0, 4)) {
      try {
        const params = new URLSearchParams({
          engine: 'google_scholar',
          q: query,
          api_key: apiKey,
          num: String(SCHOLAR_MAX_PER_QUERY),
          as_ylo: String(new Date().getFullYear() - 5), // Last 5 years
        });

        const response = await safeFetch(`https://serpapi.com/search.json?${params}`);
        if (!response.ok) continue;

        const data = await response.json();
        const organicResults = data.organic_results || [];

        for (const result of organicResults) {
          results.push({
            source: 'google_scholar',
            title: result.title,
            authors: result.publication_info?.summary || '',
            snippet: result.snippet || '',
            year: result.publication_info?.summary?.match(/\b(20\d{2})\b/)?.[1] || '',
            citedBy: result.inline_links?.cited_by?.total || 0,
            url: result.link || '',
            searchQuery: query,
          });
        }
      } catch (err) {
        console.warn(`[LiteratureSearch] Google Scholar query failed: "${query}" — ${err.message}`);
      }
    }
    return results;
  }

  /**
   * Search for PI publications via Google Scholar
   * Uses institution and field to disambiguate common names
   */
  static async _searchPIPubs(piDetails, field) {
    const apiKey = process.env.SERP_API_KEY;
    if (!apiKey || piDetails.length === 0) return [];

    const results = [];
    for (const pi of piDetails.slice(0, 3)) {
      const piName = typeof pi === 'string' ? pi : pi.name;
      const institution = typeof pi === 'string' ? '' : (pi.institution || '');
      // Add institution to disambiguate common names (e.g., "Bo Li" at MIT vs Tsinghua)
      const queryParts = [`author:"${piName}"`];
      if (institution) queryParts.push(`"${institution}"`);
      else if (field) queryParts.push(`"${field}"`);

      try {
        const params = new URLSearchParams({
          engine: 'google_scholar',
          q: queryParts.join(' '),
          api_key: apiKey,
          num: '15',
          as_ylo: String(new Date().getFullYear() - 5),
        });

        const response = await safeFetch(`https://serpapi.com/search.json?${params}`);
        if (!response.ok) continue;

        const data = await response.json();
        const organicResults = data.organic_results || [];

        results.push({
          piName,
          institution,
          publications: organicResults.map(r => ({
            title: r.title,
            year: r.publication_info?.summary?.match(/\b(20\d{2})\b/)?.[1] || '',
            snippet: r.snippet || '',
            citedBy: r.inline_links?.cited_by?.total || 0,
          })),
        });
      } catch (err) {
        console.warn(`[LiteratureSearch] PI pub search failed: "${piName}" — ${err.message}`);
      }
    }
    return results;
  }

  /**
   * Extract result from Promise.allSettled outcome
   */
  static _extractResult(settledResult) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    }
    console.warn('[LiteratureSearch] Search failed:', settledResult.reason?.message);
    return [];
  }
}
