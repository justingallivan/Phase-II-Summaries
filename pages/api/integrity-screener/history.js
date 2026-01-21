/**
 * API Route: /api/integrity-screener/history
 *
 * Get screening history and individual screening details.
 *
 * GET /api/integrity-screener/history?profileId=N - List history for user
 * GET /api/integrity-screener/history?id=N - Get single screening with full details
 * PATCH /api/integrity-screener/history - Update screening status
 */

export default async function handler(req, res) {
  try {
    const { IntegrityService } = await import('../../../lib/services/integrity-service');

    if (req.method === 'GET') {
      const { id, profileId, limit = 50, offset = 0 } = req.query;

      // Get single screening with full details
      if (id) {
        const screening = await IntegrityService.getScreening(
          parseInt(id),
          profileId ? parseInt(profileId) : null
        );

        if (!screening) {
          return res.status(404).json({ error: 'Screening not found' });
        }

        return res.json(screening);
      }

      // Get history list
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required for history list' });
      }

      const history = await IntegrityService.getScreeningHistory(
        parseInt(profileId),
        parseInt(limit),
        parseInt(offset)
      );

      return res.json({
        history,
        count: history.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

    } else if (req.method === 'PATCH') {
      const { id, status, notes } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Screening id is required' });
      }

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const validStatuses = ['pending', 'reviewed', 'cleared', 'flagged'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      await IntegrityService.updateScreeningStatus(
        parseInt(id),
        status,
        notes || null
      );

      return res.json({ success: true, id: parseInt(id), status });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('History API error:', error);
    return res.status(500).json({
      error: error.message || 'An unexpected error occurred',
    });
  }
}
