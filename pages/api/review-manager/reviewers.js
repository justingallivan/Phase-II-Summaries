/**
 * Review Manager - Reviewers API
 *
 * GET  /api/review-manager/reviewers?cycleId=&proposalId=&status=
 *   Returns accepted reviewers joined with researcher data, grouped by proposal.
 *
 * PATCH /api/review-manager/reviewers
 *   Updates review_status, notes, proposal_url, timestamps, etc.
 *   Supports single or batch updates.
 */

import { sql } from '@vercel/postgres';
import { requireAuth } from '../../../lib/utils/auth';
import { BASE_CONFIG } from '../../../shared/config/baseConfig';

export default async function handler(req, res) {
  const session = await requireAuth(req, res);
  if (!session) return;

  if (req.method === 'GET') return handleGet(req, res, session);
  if (req.method === 'PATCH') return handlePatch(req, res, session);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res, session) {
  const { cycleId, proposalId, status } = req.query;
  const profileId = session.user?.profileId || (req.query.userProfileId ? parseInt(req.query.userProfileId, 10) : null);

  try {
    // Build query for accepted reviewers
    let result;

    if (proposalId) {
      // Specific proposal — return all accepted reviewers for it
      result = await sql`
        SELECT
          rs.id as suggestion_id,
          rs.proposal_id,
          rs.proposal_title,
          rs.proposal_abstract,
          rs.proposal_authors,
          rs.proposal_institution,
          rs.program_area,
          rs.grant_cycle_id,
          rs.user_profile_id,
          rs.notes,
          rs.proposal_url,
          rs.proposal_password,
          rs.materials_sent_at,
          rs.reminder_sent_at,
          rs.reminder_count,
          rs.review_received_at,
          rs.review_blob_url,
          rs.review_filename,
          rs.thankyou_sent_at,
          rs.review_status,
          rs.co_investigators,
          rs.co_investigator_count,
          rs.summary_blob_url,
          r.id as researcher_id,
          r.name,
          r.primary_affiliation as affiliation,
          r.email,
          r.website,
          r.h_index,
          r.total_citations,
          gc.name as cycle_name,
          gc.short_code as cycle_short_code,
          gc.review_deadline,
          gc.program_name
        FROM reviewer_suggestions rs
        JOIN researchers r ON rs.researcher_id = r.id
        LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
        WHERE rs.accepted = true
          AND rs.proposal_id = ${proposalId}
          AND (rs.user_profile_id IS NULL OR rs.user_profile_id = ${profileId})
        ORDER BY rs.suggested_at DESC
      `;
    } else if (cycleId && cycleId !== 'all') {
      // Specific cycle — return all accepted reviewers in that cycle
      result = await sql`
        SELECT
          rs.id as suggestion_id,
          rs.proposal_id,
          rs.proposal_title,
          rs.proposal_abstract,
          rs.proposal_authors,
          rs.proposal_institution,
          rs.program_area,
          rs.grant_cycle_id,
          rs.user_profile_id,
          rs.notes,
          rs.proposal_url,
          rs.proposal_password,
          rs.materials_sent_at,
          rs.reminder_sent_at,
          rs.reminder_count,
          rs.review_received_at,
          rs.review_blob_url,
          rs.review_filename,
          rs.thankyou_sent_at,
          rs.review_status,
          rs.co_investigators,
          rs.co_investigator_count,
          rs.summary_blob_url,
          r.id as researcher_id,
          r.name,
          r.primary_affiliation as affiliation,
          r.email,
          r.website,
          r.h_index,
          r.total_citations,
          gc.name as cycle_name,
          gc.short_code as cycle_short_code,
          gc.review_deadline,
          gc.program_name
        FROM reviewer_suggestions rs
        JOIN researchers r ON rs.researcher_id = r.id
        LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
        WHERE rs.accepted = true
          AND rs.grant_cycle_id = ${parseInt(cycleId, 10)}
          AND (rs.user_profile_id IS NULL OR rs.user_profile_id = ${profileId})
        ORDER BY rs.proposal_title, rs.suggested_at DESC
      `;
    } else {
      // All cycles — return all accepted reviewers
      result = await sql`
        SELECT
          rs.id as suggestion_id,
          rs.proposal_id,
          rs.proposal_title,
          rs.proposal_abstract,
          rs.proposal_authors,
          rs.proposal_institution,
          rs.program_area,
          rs.grant_cycle_id,
          rs.user_profile_id,
          rs.notes,
          rs.proposal_url,
          rs.proposal_password,
          rs.materials_sent_at,
          rs.reminder_sent_at,
          rs.reminder_count,
          rs.review_received_at,
          rs.review_blob_url,
          rs.review_filename,
          rs.thankyou_sent_at,
          rs.review_status,
          rs.co_investigators,
          rs.co_investigator_count,
          rs.summary_blob_url,
          r.id as researcher_id,
          r.name,
          r.primary_affiliation as affiliation,
          r.email,
          r.website,
          r.h_index,
          r.total_citations,
          gc.name as cycle_name,
          gc.short_code as cycle_short_code,
          gc.review_deadline,
          gc.program_name
        FROM reviewer_suggestions rs
        JOIN researchers r ON rs.researcher_id = r.id
        LEFT JOIN grant_cycles gc ON rs.grant_cycle_id = gc.id
        WHERE rs.accepted = true
          AND (rs.user_profile_id IS NULL OR rs.user_profile_id = ${profileId})
        ORDER BY rs.grant_cycle_id DESC NULLS LAST, rs.proposal_title, rs.suggested_at DESC
      `;
    }

    // Optionally filter by review_status
    let rows = result.rows;
    if (status && status !== 'all') {
      rows = rows.filter(r => (r.review_status || 'accepted') === status);
    }

    // Group by proposal
    const proposals = {};
    for (const row of rows) {
      if (!proposals[row.proposal_id]) {
        proposals[row.proposal_id] = {
          proposalId: row.proposal_id,
          proposalTitle: row.proposal_title,
          proposalAbstract: row.proposal_abstract,
          proposalAuthors: row.proposal_authors,
          proposalInstitution: row.proposal_institution,
          programArea: row.program_area,
          proposalUrl: row.proposal_url,
          proposalPassword: row.proposal_password,
          grantCycleId: row.grant_cycle_id,
          cycleName: row.cycle_name,
          cycleShortCode: row.cycle_short_code,
          reviewDeadline: row.review_deadline,
          programName: row.program_name,
          summaryBlobUrl: row.summary_blob_url,
          coInvestigators: row.co_investigators,
          coInvestigatorCount: row.co_investigator_count,
          reviewers: [],
        };
      }
      proposals[row.proposal_id].reviewers.push({
        suggestionId: row.suggestion_id,
        researcherId: row.researcher_id,
        name: row.name,
        affiliation: row.affiliation,
        email: row.email,
        website: row.website,
        hIndex: row.h_index,
        totalCitations: row.total_citations,
        notes: row.notes,
        reviewStatus: row.review_status || 'accepted',
        proposalUrl: row.proposal_url,
        materialsSentAt: row.materials_sent_at,
        reminderSentAt: row.reminder_sent_at,
        reminderCount: row.reminder_count || 0,
        reviewReceivedAt: row.review_received_at,
        reviewBlobUrl: row.review_blob_url,
        reviewFilename: row.review_filename,
        thankyouSentAt: row.thankyou_sent_at,
      });
    }

    // Compute status summary per proposal
    const proposalList = Object.values(proposals).map(p => {
      const statusCounts = {};
      for (const r of p.reviewers) {
        const s = r.reviewStatus;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
      return { ...p, statusSummary: statusCounts };
    });

    return res.status(200).json({
      success: true,
      proposals: proposalList,
      totalReviewers: rows.length,
    });
  } catch (error) {
    console.error('Review Manager GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch reviewers', details: process.env.NODE_ENV === 'development' ? error.message : undefined, timestamp: new Date().toISOString() });
  }
}

async function handlePatch(req, res, session) {
  const {
    suggestionId,
    suggestionIds,
    proposalId,
    reviewStatus,
    notes,
    proposalUrl,
    proposalPassword,
  } = req.body;

  try {
    // Batch: update proposal-level fields for all reviewers of a proposal
    if (proposalId && (proposalUrl !== undefined || proposalPassword !== undefined)) {
      const updates = [];
      if (proposalUrl !== undefined) updates.push('url');
      if (proposalPassword !== undefined) updates.push('password');

      if (proposalUrl !== undefined) {
        await sql`
          UPDATE reviewer_suggestions
          SET proposal_url = ${proposalUrl || null}
          WHERE proposal_id = ${proposalId} AND accepted = true
        `;
      }
      if (proposalPassword !== undefined) {
        await sql`
          UPDATE reviewer_suggestions
          SET proposal_password = ${proposalPassword || null}
          WHERE proposal_id = ${proposalId} AND accepted = true
        `;
      }
      return res.status(200).json({ success: true, message: `Proposal ${updates.join(' & ')} updated for all reviewers` });
    }

    // Batch update by suggestionIds array
    if (suggestionIds && Array.isArray(suggestionIds) && suggestionIds.length > 0) {
      if (reviewStatus !== undefined) {
        await sql`
          UPDATE reviewer_suggestions
          SET review_status = ${reviewStatus}
          WHERE id = ANY(${suggestionIds})
        `;
      }
      return res.status(200).json({ success: true, message: `Updated ${suggestionIds.length} reviewers` });
    }

    // Single update by suggestionId
    if (!suggestionId) {
      return res.status(400).json({ error: 'suggestionId, suggestionIds, or proposalId is required' });
    }

    if (reviewStatus !== undefined) {
      await sql`
        UPDATE reviewer_suggestions
        SET review_status = ${reviewStatus}
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

    // Mark complete sets both status and potentially other fields
    if (reviewStatus === 'complete') {
      // Ensure review_received_at is set if not already
      await sql`
        UPDATE reviewer_suggestions
        SET review_received_at = COALESCE(review_received_at, NOW())
        WHERE id = ${suggestionId}
      `;
    }

    return res.status(200).json({ success: true, message: 'Reviewer updated' });
  } catch (error) {
    console.error('Review Manager PATCH error:', error);
    return res.status(500).json({ error: 'Failed to update reviewer', details: process.env.NODE_ENV === 'development' ? error.message : undefined, timestamp: new Date().toISOString() });
  }
}
