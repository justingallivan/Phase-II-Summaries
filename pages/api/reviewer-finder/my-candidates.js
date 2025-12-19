/**
 * API Route: /api/reviewer-finder/my-candidates
 *
 * GET: Fetch all saved candidates grouped by proposal
 * PATCH: Update candidate status (invited, accepted, notes)
 * DELETE: Remove a saved candidate
 */

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'PATCH') {
    return handlePatch(req, res);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req, res) {
  try {
    // Get all saved candidates with researcher details, grouped by proposal
    const result = await sql`
      SELECT
        rs.id as suggestion_id,
        rs.proposal_id,
        rs.proposal_title,
        rs.proposal_abstract,
        rs.proposal_authors,
        rs.proposal_institution,
        rs.relevance_score,
        rs.match_reason,
        rs.sources,
        rs.selected,
        rs.invited,
        rs.accepted,
        rs.notes,
        rs.suggested_at,
        r.id as researcher_id,
        r.name,
        r.primary_affiliation as affiliation,
        r.email,
        r.website,
        r.h_index,
        r.total_citations
      FROM reviewer_suggestions rs
      JOIN researchers r ON rs.researcher_id = r.id
      WHERE rs.selected = true
      ORDER BY rs.suggested_at DESC
    `;

    // Group by proposal
    const proposals = {};
    for (const row of result.rows) {
      if (!proposals[row.proposal_id]) {
        proposals[row.proposal_id] = {
          proposalId: row.proposal_id,
          proposalTitle: row.proposal_title,
          proposalAbstract: row.proposal_abstract,
          proposalAuthors: row.proposal_authors,
          proposalInstitution: row.proposal_institution,
          candidates: []
        };
      }
      proposals[row.proposal_id].candidates.push({
        suggestionId: row.suggestion_id,
        researcherId: row.researcher_id,
        name: row.name,
        affiliation: row.affiliation,
        email: row.email,
        website: row.website,
        hIndex: row.h_index,
        totalCitations: row.total_citations,
        relevanceScore: row.relevance_score,
        reasoning: row.match_reason,
        sources: row.sources,
        invited: row.invited,
        accepted: row.accepted,
        notes: row.notes,
        savedAt: row.suggested_at
      });
    }

    return res.status(200).json({
      success: true,
      proposals: Object.values(proposals),
      totalCandidates: result.rows.length
    });
  } catch (error) {
    console.error('Get my candidates error:', error);
    return res.status(500).json({
      error: 'Failed to fetch candidates',
      message: error.message
    });
  }
}

async function handlePatch(req, res) {
  try {
    const { suggestionId, invited, accepted, notes } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (invited !== undefined) {
      updates.push('invited');
      values.push(invited);
    }
    if (accepted !== undefined) {
      updates.push('accepted');
      values.push(accepted);
    }
    if (notes !== undefined) {
      updates.push('notes');
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Use separate update statements for each field to avoid dynamic SQL issues
    if (invited !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET invited = ${invited}
        WHERE id = ${suggestionId}
      `;
    }
    if (accepted !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET accepted = ${accepted}
        WHERE id = ${suggestionId}
      `;
    }
    if (notes !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET notes = ${notes}
        WHERE id = ${suggestionId}
      `;
    }

    return res.status(200).json({
      success: true,
      message: 'Candidate updated'
    });
  } catch (error) {
    console.error('Update candidate error:', error);
    return res.status(500).json({
      error: 'Failed to update candidate',
      message: error.message
    });
  }
}

async function handleDelete(req, res) {
  try {
    const { suggestionId } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId is required' });
    }

    // Mark as not selected (soft delete) rather than hard delete
    await sql`
      UPDATE reviewer_suggestions
      SET selected = false
      WHERE id = ${suggestionId}
    `;

    return res.status(200).json({
      success: true,
      message: 'Candidate removed'
    });
  } catch (error) {
    console.error('Delete candidate error:', error);
    return res.status(500).json({
      error: 'Failed to remove candidate',
      message: error.message
    });
  }
}
