/**
 * API Route: /api/reviewer-finder/researchers
 *
 * GET: Fetch all researchers with search, sort, and pagination
 *
 * Query parameters:
 *   search: string       - Search name, affiliation, email
 *   sortBy: string       - 'name' | 'affiliation' | 'h_index' | 'last_updated' (default: 'last_updated')
 *   sortOrder: string    - 'asc' | 'desc' (default: 'desc')
 *   limit: number        - Default: 50
 *   offset: number       - Default: 0
 *   hasEmail: boolean    - Filter: only with email
 *   hasWebsite: boolean  - Filter: only with website
 *   keywords: string     - Comma-separated keywords to filter by
 *   mode: string         - 'keywords' to return keyword list instead of researchers
 */

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      search = '',
      sortBy = 'last_updated',
      sortOrder = 'desc',
      limit = '50',
      offset = '0',
      hasEmail,
      hasWebsite,
      keywords,
      mode,
    } = req.query;

    // Mode: return keyword list for filter dropdown
    if (mode === 'keywords') {
      const keywordsResult = await sql`
        SELECT keyword, COUNT(DISTINCT researcher_id) as count
        FROM researcher_keywords
        GROUP BY keyword
        ORDER BY count DESC, keyword ASC
        LIMIT 200
      `;

      return res.status(200).json({
        success: true,
        keywords: keywordsResult.rows.map(row => ({
          keyword: row.keyword,
          count: parseInt(row.count)
        }))
      });
    }

    // Parse and validate pagination
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);

    // Validate sort options
    const validSortBy = ['name', 'affiliation', 'h_index', 'last_updated'];
    const validSortOrder = ['asc', 'desc'];
    const safeSortBy = validSortBy.includes(sortBy) ? sortBy : 'last_updated';
    const safeSortOrder = validSortOrder.includes(sortOrder) ? sortOrder : 'desc';

    // Map sortBy to actual column names
    const sortColumnMap = {
      'name': 'name',
      'affiliation': 'primary_affiliation',
      'h_index': 'h_index',
      'last_updated': 'last_updated'
    };
    const sortColumn = sortColumnMap[safeSortBy];

    // Build conditions array
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Search filter
    if (search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(`(
        name ILIKE $${paramIndex} OR
        primary_affiliation ILIKE $${paramIndex} OR
        email ILIKE $${paramIndex}
      )`);
      params.push(searchTerm);
      paramIndex++;
    }

    // Email filter
    if (hasEmail === 'true') {
      conditions.push(`email IS NOT NULL AND email != ''`);
    }

    // Website filter
    if (hasWebsite === 'true') {
      conditions.push(`website IS NOT NULL AND website != ''`);
    }

    // Keyword filter - match researchers with ANY of the specified keywords
    if (keywords) {
      const keywordList = keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
      if (keywordList.length > 0) {
        conditions.push(`id IN (
          SELECT DISTINCT researcher_id
          FROM researcher_keywords
          WHERE keyword = ANY($${paramIndex}::text[])
        )`);
        params.push(keywordList);
        paramIndex++;
      }
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM researchers ${whereClause}`;
    const countResult = await sql.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get researchers with pagination
    // Handle NULL values in sorting appropriately
    const nullsHandling = safeSortOrder === 'desc' ? 'NULLS LAST' : 'NULLS FIRST';

    const dataQuery = `
      SELECT
        id,
        name,
        primary_affiliation as affiliation,
        department,
        email,
        email_source,
        website,
        faculty_page_url,
        orcid,
        google_scholar_id,
        google_scholar_url,
        h_index,
        i10_index,
        total_citations,
        contact_enriched_at,
        created_at,
        last_updated
      FROM researchers
      ${whereClause}
      ORDER BY ${sortColumn} ${safeSortOrder.toUpperCase()} ${nullsHandling}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await sql.query(dataQuery, [...params, limitNum, offsetNum]);

    // Fetch keywords for all researchers in one query
    const researcherIds = dataResult.rows.map(r => r.id);
    let keywordsByResearcher = {};

    if (researcherIds.length > 0) {
      const keywordsResult = await sql`
        SELECT researcher_id, keyword, relevance_score, source
        FROM researcher_keywords
        WHERE researcher_id = ANY(${researcherIds})
        ORDER BY relevance_score DESC
      `;

      // Group keywords by researcher
      for (const row of keywordsResult.rows) {
        if (!keywordsByResearcher[row.researcher_id]) {
          keywordsByResearcher[row.researcher_id] = [];
        }
        keywordsByResearcher[row.researcher_id].push({
          keyword: row.keyword,
          relevanceScore: row.relevance_score,
          source: row.source
        });
      }
    }

    // Transform rows to camelCase and add keywords
    const researchers = dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      affiliation: row.affiliation,
      department: row.department,
      email: row.email,
      emailSource: row.email_source,
      website: row.website,
      facultyPageUrl: row.faculty_page_url,
      orcid: row.orcid,
      googleScholarId: row.google_scholar_id,
      googleScholarUrl: row.google_scholar_url,
      hIndex: row.h_index,
      i10Index: row.i10_index,
      totalCitations: row.total_citations,
      contactEnrichedAt: row.contact_enriched_at,
      createdAt: row.created_at,
      lastUpdated: row.last_updated,
      keywords: keywordsByResearcher[row.id] || [],
    }));

    return res.status(200).json({
      success: true,
      researchers,
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + researchers.length < total,
    });

  } catch (error) {
    console.error('Get researchers error:', error);
    return res.status(500).json({
      error: 'Failed to fetch researchers',
      message: error.message
    });
  }
}
