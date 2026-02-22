/**
 * API Route: /api/reviewer-finder/researchers
 *
 * GET: Fetch all researchers with search, sort, and pagination
 * POST: Create new researcher OR Merge researchers (combine duplicates)
 * PATCH: Update researcher info
 * DELETE: Delete researcher(s)
 *
 * Query parameters (GET):
 *   id: number           - Fetch single researcher with full details (keywords + proposals)
 *   search: string       - Search name, affiliation, email
 *   sortBy: string       - 'name' | 'affiliation' | 'h_index' | 'last_updated' (default: 'last_updated')
 *   sortOrder: string    - 'asc' | 'desc' (default: 'desc')
 *   limit: number        - Default: 50
 *   offset: number       - Default: 0
 *   hasEmail: boolean    - Filter: only with email
 *   hasWebsite: boolean  - Filter: only with website
 *   keywords: string     - Comma-separated keywords to filter by
 *   mode: string         - 'keywords' to return keyword list instead of researchers
 *   mode: string         - 'duplicates' to find potential duplicate researchers
 *
 * POST body (create - when name provided, no primaryId):
 *   name: string         - Required: Researcher name
 *   affiliation: string  - Institution
 *   department: string   - Department
 *   email: string        - Email address
 *   website: string      - Website URL
 *   orcid: string        - ORCID ID
 *   googleScholarId: string - Google Scholar user ID
 *   hIndex: number       - h-index
 *   i10Index: number     - i10-index
 *   totalCitations: number - Total citations
 *   notes: string        - Notes about this researcher
 *   proposalId: number   - Optional: proposal_searches.id to associate with
 *   matchReason: string  - Optional: Why this reviewer matches the proposal
 *   keywords: string[]   - Optional: Expertise keywords
 *
 * POST body (merge - when primaryId provided):
 *   primaryId: number    - Researcher ID to keep
 *   secondaryIds: number[] - Researcher IDs to merge into primary and delete
 *
 * PATCH body:
 *   id: number           - Researcher ID to update
 *   name, affiliation, email, website, hIndex, etc.
 *
 * DELETE body:
 *   id: number           - Single researcher ID to delete
 *   ids: number[]        - Multiple researcher IDs to delete
 */

import { sql } from '@vercel/postgres';
import { requireAppAccess } from '../../../lib/utils/auth';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

async function checkSuperuser(profileId) {
  try {
    const result = await sql`
      SELECT role FROM dynamics_user_roles
      WHERE user_profile_id = ${profileId}
    `;
    return result.rows[0]?.role === 'superuser';
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // Require authentication + app access
  const access = await requireAppAccess(req, res, 'reviewer-finder');
  if (!access) return;

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    // Distinguish between create (has name, no primaryId) and merge (has primaryId)
    const { primaryId, name } = req.body || {};
    if (primaryId) {
      return handleMerge(req, res);
    } else if (name) {
      return handleCreate(req, res);
    } else {
      return res.status(400).json({ error: 'Either primaryId (for merge) or name (for create) is required' });
    }
  } else if (req.method === 'PATCH' || req.method === 'DELETE') {
    // Restrict modifications to superusers (skip in dev mode)
    if (!access.session.authBypassed) {
      if (!access.profileId || !(await checkSuperuser(access.profileId))) {
        return res.status(403).json({ error: 'Superuser access required to modify researchers' });
      }
    }
    if (req.method === 'PATCH') return handlePatch(req, res);
    return handleDelete(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {

  try {
    const {
      id,
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

    // Mode: find potential duplicate researchers
    if (mode === 'duplicates') {
      // Find duplicates by: exact email, similar name, same ORCID, same Google Scholar ID
      const duplicatesResult = await sql`
        WITH duplicate_groups AS (
          -- Group by exact email (non-null)
          SELECT
            'email' as match_type,
            email as match_value,
            ARRAY_AGG(id ORDER BY created_at) as researcher_ids
          FROM researchers
          WHERE email IS NOT NULL AND email != ''
          GROUP BY email
          HAVING COUNT(*) > 1

          UNION ALL

          -- Group by normalized name (similar names)
          SELECT
            'name' as match_type,
            normalized_name as match_value,
            ARRAY_AGG(id ORDER BY created_at) as researcher_ids
          FROM researchers
          WHERE normalized_name IS NOT NULL
          GROUP BY normalized_name
          HAVING COUNT(*) > 1

          UNION ALL

          -- Group by ORCID (non-null)
          SELECT
            'orcid' as match_type,
            orcid as match_value,
            ARRAY_AGG(id ORDER BY created_at) as researcher_ids
          FROM researchers
          WHERE orcid IS NOT NULL AND orcid != ''
          GROUP BY orcid
          HAVING COUNT(*) > 1

          UNION ALL

          -- Group by Google Scholar ID (non-null)
          SELECT
            'google_scholar' as match_type,
            google_scholar_id as match_value,
            ARRAY_AGG(id ORDER BY created_at) as researcher_ids
          FROM researchers
          WHERE google_scholar_id IS NOT NULL AND google_scholar_id != ''
          GROUP BY google_scholar_id
          HAVING COUNT(*) > 1
        )
        SELECT DISTINCT match_type, match_value, researcher_ids
        FROM duplicate_groups
        ORDER BY match_type, match_value
        LIMIT 100
      `;

      // Fetch details for all researchers in duplicate groups
      const allIds = new Set();
      duplicatesResult.rows.forEach(row => {
        row.researcher_ids.forEach(id => allIds.add(id));
      });

      let researcherDetails = {};
      if (allIds.size > 0) {
        const detailsResult = await sql`
          SELECT id, name, primary_affiliation, email, website, orcid, google_scholar_id, h_index, created_at
          FROM researchers
          WHERE id = ANY(${Array.from(allIds)})
        `;
        detailsResult.rows.forEach(r => {
          researcherDetails[r.id] = {
            id: r.id,
            name: r.name,
            affiliation: r.primary_affiliation,
            email: r.email,
            website: r.website,
            orcid: r.orcid,
            googleScholarId: r.google_scholar_id,
            hIndex: r.h_index,
            createdAt: r.created_at
          };
        });
      }

      // Build duplicate groups with researcher details
      const duplicateGroups = duplicatesResult.rows.map(row => ({
        matchType: row.match_type,
        matchValue: row.match_value,
        researchers: row.researcher_ids.map(id => researcherDetails[id]).filter(Boolean)
      }));

      return res.status(200).json({
        success: true,
        duplicateGroups,
        totalGroups: duplicateGroups.length
      });
    }

    // Mode: fetch single researcher with full details
    if (id) {
      const researcherId = parseInt(id);
      if (isNaN(researcherId)) {
        return res.status(400).json({ error: 'Invalid researcher ID' });
      }

      // Fetch researcher
      const researcherResult = await sql`
        SELECT
          id, name, normalized_name, primary_affiliation, department,
          email, email_source, email_year, email_verified_at,
          website, faculty_page_url, orcid, orcid_url,
          google_scholar_id, google_scholar_url,
          h_index, i10_index, total_citations, notes,
          contact_enriched_at, contact_enrichment_source,
          created_at, last_updated, last_checked, metrics_updated_at
        FROM researchers
        WHERE id = ${researcherId}
      `;

      if (researcherResult.rows.length === 0) {
        return res.status(404).json({ error: 'Researcher not found' });
      }

      const row = researcherResult.rows[0];

      // Fetch all keywords for this researcher
      const keywordsResult = await sql`
        SELECT keyword, relevance_score, source, created_at
        FROM researcher_keywords
        WHERE researcher_id = ${researcherId}
        ORDER BY relevance_score DESC, keyword ASC
      `;

      // Fetch proposal associations with grant cycle info
      const proposalsResult = await sql`
        SELECT
          rs.proposal_id, rs.proposal_title, rs.relevance_score, rs.match_reason,
          rs.sources, rs.selected, rs.invited, rs.notes, rs.suggested_at,
          rs.email_sent_at, rs.response_received_at, rs.response_type,
          rs.grant_cycle_id, gc.name as grant_cycle_name, gc.short_code as grant_cycle_short_code
        FROM reviewer_suggestions rs
        LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
        WHERE rs.researcher_id = ${researcherId}
        ORDER BY rs.suggested_at DESC
      `;

      return res.status(200).json({
        success: true,
        researcher: {
          id: row.id,
          name: row.name,
          normalizedName: row.normalized_name,
          affiliation: row.primary_affiliation,
          department: row.department,
          email: row.email,
          emailSource: row.email_source,
          emailYear: row.email_year,
          emailVerifiedAt: row.email_verified_at,
          website: row.website,
          facultyPageUrl: row.faculty_page_url,
          orcid: row.orcid,
          orcidUrl: row.orcid_url,
          googleScholarId: row.google_scholar_id,
          googleScholarUrl: row.google_scholar_url,
          hIndex: row.h_index,
          i10Index: row.i10_index,
          totalCitations: row.total_citations,
          notes: row.notes,
          contactEnrichedAt: row.contact_enriched_at,
          contactEnrichmentSource: row.contact_enrichment_source,
          createdAt: row.created_at,
          lastUpdated: row.last_updated,
          lastChecked: row.last_checked,
          metricsUpdatedAt: row.metrics_updated_at,
        },
        keywords: keywordsResult.rows.map(k => ({
          keyword: k.keyword,
          relevanceScore: k.relevance_score,
          source: k.source,
          createdAt: k.created_at,
        })),
        proposals: proposalsResult.rows.map(p => ({
          proposalId: p.proposal_id,
          proposalTitle: p.proposal_title,
          relevanceScore: p.relevance_score,
          matchReason: p.match_reason,
          sources: p.sources,
          selected: p.selected,
          invited: p.invited,
          notes: p.notes,
          suggestedAt: p.suggested_at,
          emailSentAt: p.email_sent_at,
          responseReceivedAt: p.response_received_at,
          responseType: p.response_type,
          grantCycleId: p.grant_cycle_id,
          grantCycleName: p.grant_cycle_name,
          grantCycleShortCode: p.grant_cycle_short_code,
        })),
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Handle PATCH - Update researcher info
 */
async function handlePatch(req, res) {
  try {
    const {
      id,
      name,
      affiliation,
      department,
      email,
      website,
      orcid,
      googleScholarId,
      googleScholarUrl,
      hIndex,
      i10Index,
      totalCitations,
      notes
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Researcher ID is required' });
    }

    const researcherId = parseInt(id);
    if (isNaN(researcherId)) {
      return res.status(400).json({ error: 'Invalid researcher ID' });
    }

    // Check if researcher exists
    const existing = await sql`
      SELECT id FROM researchers WHERE id = ${researcherId}
    `;
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Researcher not found' });
    }

    // Build update fields
    const updates = [];

    if (name !== undefined) {
      await sql`
        UPDATE researchers
        SET name = ${name}, normalized_name = ${name.toLowerCase()}, last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('name');
    }

    if (affiliation !== undefined) {
      await sql`
        UPDATE researchers
        SET primary_affiliation = ${affiliation}, last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('affiliation');
    }

    if (department !== undefined) {
      await sql`
        UPDATE researchers
        SET department = ${department}, last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('department');
    }

    if (email !== undefined) {
      await sql`
        UPDATE researchers
        SET email = ${email || null}, email_source = 'manual', last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('email');
    }

    if (website !== undefined) {
      await sql`
        UPDATE researchers
        SET website = ${website || null}, last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('website');
    }

    if (orcid !== undefined) {
      const orcidUrl = orcid ? `https://orcid.org/${orcid}` : null;
      await sql`
        UPDATE researchers
        SET orcid = ${orcid || null}, orcid_url = ${orcidUrl}, last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('orcid');
    }

    if (googleScholarId !== undefined) {
      const scholarUrl = googleScholarId
        ? `https://scholar.google.com/citations?user=${googleScholarId}`
        : googleScholarUrl || null;
      await sql`
        UPDATE researchers
        SET google_scholar_id = ${googleScholarId || null},
            google_scholar_url = ${scholarUrl},
            last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('googleScholarId');
    }

    if (hIndex !== undefined) {
      await sql`
        UPDATE researchers
        SET h_index = ${hIndex !== null ? parseInt(hIndex) : null},
            metrics_updated_at = NOW(),
            last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('hIndex');
    }

    if (i10Index !== undefined) {
      await sql`
        UPDATE researchers
        SET i10_index = ${i10Index !== null ? parseInt(i10Index) : null},
            metrics_updated_at = NOW(),
            last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('i10Index');
    }

    if (totalCitations !== undefined) {
      await sql`
        UPDATE researchers
        SET total_citations = ${totalCitations !== null ? parseInt(totalCitations) : null},
            metrics_updated_at = NOW(),
            last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('totalCitations');
    }

    if (notes !== undefined) {
      await sql`
        UPDATE researchers
        SET notes = ${notes || null},
            last_updated = NOW()
        WHERE id = ${researcherId}
      `;
      updates.push('notes');
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    return res.status(200).json({
      success: true,
      message: 'Researcher updated',
      updated: {
        id: researcherId,
        fields: updates
      }
    });

  } catch (error) {
    console.error('Update researcher error:', error);
    return res.status(500).json({
      error: 'Failed to update researcher',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Handle DELETE - Delete researcher(s)
 * Note: This is a hard delete. Associated keywords are deleted via ON DELETE CASCADE.
 * Reviewer suggestions are NOT deleted (preserves proposal history).
 */
async function handleDelete(req, res) {
  try {
    const { id, ids } = req.body;

    // Support single ID or array of IDs
    let researcherIds = [];
    if (ids && Array.isArray(ids)) {
      researcherIds = ids.map(i => parseInt(i)).filter(i => !isNaN(i));
    } else if (id) {
      const parsedId = parseInt(id);
      if (!isNaN(parsedId)) {
        researcherIds = [parsedId];
      }
    }

    if (researcherIds.length === 0) {
      return res.status(400).json({ error: 'At least one valid researcher ID is required' });
    }

    // Check how many suggestions reference these researchers
    const suggestionsResult = await sql`
      SELECT COUNT(*) as count
      FROM reviewer_suggestions
      WHERE researcher_id = ANY(${researcherIds})
    `;
    const suggestionCount = parseInt(suggestionsResult.rows[0].count);

    // Delete researchers (keywords cascade automatically)
    const deleteResult = await sql`
      DELETE FROM researchers
      WHERE id = ANY(${researcherIds})
      RETURNING id
    `;

    const deletedCount = deleteResult.rows.length;

    // Note: reviewer_suggestions will have NULL researcher_id references now
    // This is acceptable - we preserve the suggestion history even without the researcher

    return res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} researcher(s)`,
      deleted: {
        count: deletedCount,
        ids: deleteResult.rows.map(r => r.id),
        orphanedSuggestions: suggestionCount
      }
    });

  } catch (error) {
    console.error('Delete researcher error:', error);
    return res.status(500).json({
      error: 'Failed to delete researcher',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Handle POST - Create new researcher
 * Creates a new researcher with optional proposal association
 */
async function handleCreate(req, res) {
  try {
    const {
      name,
      affiliation,
      department,
      email,
      website,
      orcid,
      googleScholarId,
      hIndex,
      i10Index,
      totalCitations,
      notes,
      // Optional proposal association
      proposalId,
      matchReason,
      keywords  // Array of expertise keywords
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const normalizedName = name.trim().toLowerCase();
    const orcidUrl = orcid ? `https://orcid.org/${orcid}` : null;
    const googleScholarUrl = googleScholarId
      ? `https://scholar.google.com/citations?user=${googleScholarId}`
      : null;

    // Create the researcher
    const result = await sql`
      INSERT INTO researchers (
        name,
        normalized_name,
        primary_affiliation,
        department,
        email,
        email_source,
        website,
        orcid,
        orcid_url,
        google_scholar_id,
        google_scholar_url,
        h_index,
        i10_index,
        total_citations,
        notes,
        created_at,
        last_updated
      ) VALUES (
        ${name.trim()},
        ${normalizedName},
        ${affiliation || null},
        ${department || null},
        ${email || null},
        ${email ? 'manual' : null},
        ${website || null},
        ${orcid || null},
        ${orcidUrl},
        ${googleScholarId || null},
        ${googleScholarUrl},
        ${hIndex ? parseInt(hIndex) : null},
        ${i10Index ? parseInt(i10Index) : null},
        ${totalCitations ? parseInt(totalCitations) : null},
        ${notes || null},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const researcherId = result.rows[0].id;

    // Add keywords if provided
    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      for (const keyword of keywords) {
        if (keyword && keyword.trim()) {
          await sql`
            INSERT INTO researcher_keywords (researcher_id, keyword, relevance_score, source, created_at)
            VALUES (${researcherId}, ${keyword.trim().toLowerCase()}, 1.0, 'manual', NOW())
            ON CONFLICT (researcher_id, keyword, source) DO NOTHING
          `;
        }
      }
    }

    // If proposalId provided, create proposal association
    // proposalId is the proposal_id string from reviewer_suggestions
    let proposalAssociation = null;
    if (proposalId) {
      // Fetch proposal details from existing reviewer_suggestions entry
      const proposalResult = await sql`
        SELECT DISTINCT ON (proposal_id)
          proposal_id, proposal_title, summary_blob_url, co_investigators, co_investigator_count,
          grant_cycle_id, user_profile_id
        FROM reviewer_suggestions
        WHERE proposal_id = ${proposalId}
        ORDER BY proposal_id, suggested_at DESC
        LIMIT 1
      `;

      if (proposalResult.rows.length > 0) {
        const proposal = proposalResult.rows[0];

        // Create reviewer_suggestions entry
        await sql`
          INSERT INTO reviewer_suggestions (
            proposal_id,
            proposal_title,
            researcher_id,
            relevance_score,
            match_reason,
            sources,
            selected,
            suggested_at,
            summary_blob_url,
            co_investigators,
            co_investigator_count,
            grant_cycle_id,
            user_profile_id
          ) VALUES (
            ${proposal.proposal_id},
            ${proposal.proposal_title},
            ${researcherId},
            ${1.0},
            ${matchReason || 'Manually added reviewer'},
            ${['manual']},
            ${true},
            NOW(),
            ${proposal.summary_blob_url},
            ${proposal.co_investigators},
            ${proposal.co_investigator_count},
            ${proposal.grant_cycle_id},
            ${proposal.user_profile_id}
          )
          ON CONFLICT (proposal_id, researcher_id) DO NOTHING
        `;

        proposalAssociation = {
          proposalId: proposal.proposal_id,
          proposalTitle: proposal.proposal_title
        };
      }
    }

    return res.status(201).json({
      success: true,
      researcher: {
        id: researcherId,
        name: name.trim(),
        affiliation,
        email,
        website
      },
      proposalAssociation,
      message: proposalAssociation
        ? `Researcher created and associated with "${proposalAssociation.proposalTitle}"`
        : 'Researcher created successfully'
    });

  } catch (error) {
    console.error('Create researcher error:', error);
    return res.status(500).json({
      error: 'Failed to create researcher',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Handle POST - Merge researchers (combine duplicates)
 * Moves all keywords and proposal associations from secondary researchers to primary,
 * then deletes the secondary researchers.
 */
async function handleMerge(req, res) {
  try {
    const { primaryId, secondaryIds } = req.body;

    if (!primaryId) {
      return res.status(400).json({ error: 'Primary researcher ID is required' });
    }

    const parsedPrimaryId = parseInt(primaryId);
    if (isNaN(parsedPrimaryId)) {
      return res.status(400).json({ error: 'Invalid primary researcher ID' });
    }

    if (!secondaryIds || !Array.isArray(secondaryIds) || secondaryIds.length === 0) {
      return res.status(400).json({ error: 'At least one secondary researcher ID is required' });
    }

    const parsedSecondaryIds = secondaryIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id !== parsedPrimaryId);
    if (parsedSecondaryIds.length === 0) {
      return res.status(400).json({ error: 'No valid secondary researcher IDs provided' });
    }

    // Verify primary researcher exists
    const primaryResult = await sql`
      SELECT id, name, email, website, orcid, google_scholar_id, h_index
      FROM researchers WHERE id = ${parsedPrimaryId}
    `;
    if (primaryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Primary researcher not found' });
    }

    const primary = primaryResult.rows[0];
    let mergedData = {
      keywordsMoved: 0,
      suggestionsMoved: 0,
      conflictsResolved: 0,
      secondariesDeleted: 0
    };

    // For each secondary researcher
    for (const secondaryId of parsedSecondaryIds) {
      // Get secondary researcher data for potential field updates
      const secondaryResult = await sql`
        SELECT id, email, website, orcid, google_scholar_id, h_index, i10_index, total_citations
        FROM researchers WHERE id = ${secondaryId}
      `;

      if (secondaryResult.rows.length === 0) {
        continue; // Skip if secondary doesn't exist
      }

      const secondary = secondaryResult.rows[0];

      // Move keywords (avoid duplicates by using ON CONFLICT)
      const keywordsResult = await sql`
        INSERT INTO researcher_keywords (researcher_id, keyword, relevance_score, source, created_at)
        SELECT ${parsedPrimaryId}, keyword, relevance_score, source, created_at
        FROM researcher_keywords
        WHERE researcher_id = ${secondaryId}
        ON CONFLICT (researcher_id, keyword, source) DO NOTHING
      `;
      // Count moved keywords
      const keywordCountResult = await sql`
        SELECT COUNT(*) as count FROM researcher_keywords WHERE researcher_id = ${secondaryId}
      `;
      mergedData.keywordsMoved += parseInt(keywordCountResult.rows[0].count || 0);

      // Move proposal associations (reviewer_suggestions)
      // First, find proposals where BOTH primary and secondary have suggestions (conflict)
      const conflictingProposals = await sql`
        SELECT s.proposal_id
        FROM reviewer_suggestions s
        WHERE s.researcher_id = ${secondaryId}
          AND EXISTS (
            SELECT 1 FROM reviewer_suggestions p
            WHERE p.researcher_id = ${parsedPrimaryId}
              AND p.proposal_id = s.proposal_id
          )
      `;

      // Delete secondary's suggestions for conflicting proposals (primary already has them)
      if (conflictingProposals.rows.length > 0) {
        const conflictIds = conflictingProposals.rows.map(r => r.proposal_id);
        await sql`
          DELETE FROM reviewer_suggestions
          WHERE researcher_id = ${secondaryId}
            AND proposal_id = ANY(${conflictIds})
        `;
      }

      // Now safely move remaining suggestions (no conflicts)
      const suggestionsResult = await sql`
        UPDATE reviewer_suggestions
        SET researcher_id = ${parsedPrimaryId}
        WHERE researcher_id = ${secondaryId}
      `;
      mergedData.suggestionsMoved += suggestionsResult.rowCount || 0;
      mergedData.conflictsResolved += conflictingProposals.rows.length;

      // Update primary with missing data from secondary (only if primary is missing the data)
      if (!primary.email && secondary.email) {
        await sql`UPDATE researchers SET email = ${secondary.email}, email_source = 'merged' WHERE id = ${parsedPrimaryId}`;
      }
      if (!primary.website && secondary.website) {
        await sql`UPDATE researchers SET website = ${secondary.website} WHERE id = ${parsedPrimaryId}`;
      }
      if (!primary.orcid && secondary.orcid) {
        await sql`UPDATE researchers SET orcid = ${secondary.orcid}, orcid_url = ${'https://orcid.org/' + secondary.orcid} WHERE id = ${parsedPrimaryId}`;
      }
      if (!primary.google_scholar_id && secondary.google_scholar_id) {
        await sql`UPDATE researchers SET google_scholar_id = ${secondary.google_scholar_id}, google_scholar_url = ${'https://scholar.google.com/citations?user=' + secondary.google_scholar_id} WHERE id = ${parsedPrimaryId}`;
      }
      // Take higher h-index
      if (secondary.h_index && (!primary.h_index || secondary.h_index > primary.h_index)) {
        await sql`UPDATE researchers SET h_index = ${secondary.h_index} WHERE id = ${parsedPrimaryId}`;
      }
      // Take higher i10-index
      if (secondary.i10_index) {
        await sql`UPDATE researchers SET i10_index = GREATEST(COALESCE(i10_index, 0), ${secondary.i10_index}) WHERE id = ${parsedPrimaryId}`;
      }
      // Take higher citation count
      if (secondary.total_citations) {
        await sql`UPDATE researchers SET total_citations = GREATEST(COALESCE(total_citations, 0), ${secondary.total_citations}) WHERE id = ${parsedPrimaryId}`;
      }

      // Delete secondary researcher (keywords will cascade)
      await sql`DELETE FROM researchers WHERE id = ${secondaryId}`;
      mergedData.secondariesDeleted++;
    }

    // Update primary's last_updated timestamp
    await sql`UPDATE researchers SET last_updated = NOW() WHERE id = ${parsedPrimaryId}`;

    return res.status(200).json({
      success: true,
      message: `Merged ${mergedData.secondariesDeleted} researcher(s) into primary`,
      merged: {
        primaryId: parsedPrimaryId,
        ...mergedData
      }
    });

  } catch (error) {
    console.error('Merge researchers error:', error);
    return res.status(500).json({
      error: 'Failed to merge researchers',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
}
