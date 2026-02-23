/**
 * Cron: /api/cron/log-analysis
 *
 * Runs every 6 hours. Fetches recent error logs from the Vercel REST API
 * and, if the error count exceeds a threshold, sends them to Claude Haiku
 * for root-cause analysis.
 *
 * Requires optional env vars:
 *   VERCEL_API_TOKEN   — Vercel personal access token
 *   VERCEL_PROJECT_ID  — Target project ID
 *
 * If either is missing, the cron returns 200 with { skipped: true }.
 * Cost: ~$0.01/analysis using Haiku; under $1/month.
 *
 * Auth: Vercel CRON_SECRET (dev mode bypasses)
 */

import { verifyCronSecret } from '../../../lib/utils/cron-auth';
import NotificationService from '../../../lib/services/notification-service';

const ERROR_THRESHOLD = 10; // minimum errors to trigger AI analysis
const LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCronSecret(req, res)) return;

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return res.json({ ok: true, skipped: true, reason: 'VERCEL_API_TOKEN or VERCEL_PROJECT_ID not configured' });
  }

  try {
    // Fetch recent error logs from Vercel
    const since = Date.now() - LOOKBACK_MS;
    const logsUrl = `https://api.vercel.com/v2/projects/${projectId}/events?limit=100&types=error&since=${since}`;

    const logsResponse = await fetch(logsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!logsResponse.ok) {
      const errText = await logsResponse.text();
      console.error(`Vercel API error: ${logsResponse.status} ${errText}`);
      return res.status(502).json({ error: 'Failed to fetch Vercel logs', status: logsResponse.status });
    }

    const logsData = await logsResponse.json();
    const events = logsData.events || [];

    // Extract error messages
    const errors = events
      .filter(e => e.type === 'error' || e.type === 'stderr')
      .map(e => ({
        timestamp: e.created,
        message: e.text || e.payload?.text || JSON.stringify(e.payload || {}),
        path: e.payload?.path || e.proxy?.path || 'unknown',
      }));

    if (errors.length < ERROR_THRESHOLD) {
      return res.json({
        ok: true,
        errorCount: errors.length,
        threshold: ERROR_THRESHOLD,
        analysis: null,
        message: `${errors.length} errors in last 6h (below threshold of ${ERROR_THRESHOLD})`,
      });
    }

    // Summarize errors for AI analysis
    const errorSummary = errors
      .slice(0, 50) // limit to 50 for token efficiency
      .map(e => `[${new Date(e.timestamp).toISOString()}] ${e.path}: ${e.message}`)
      .join('\n');

    // Send to Claude Haiku for root-cause analysis
    const analysisResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a server ops assistant. Analyze these ${errors.length} error log entries from a Next.js application on Vercel. Identify patterns, probable root causes, and suggest fixes. Be concise.\n\n${errorSummary}`,
        }],
      }),
    });

    let analysis = 'AI analysis unavailable';
    if (analysisResponse.ok) {
      const aiResult = await analysisResponse.json();
      analysis = aiResult.content?.[0]?.text || 'No analysis returned';
    }

    // Create alert with analysis
    await NotificationService.notify({
      type: 'log_analysis',
      severity: errors.length >= 50 ? 'error' : 'warning',
      title: `${errors.length} server errors in last 6 hours`,
      message: analysis,
      metadata: {
        errorCount: errors.length,
        topPaths: getTopPaths(errors),
        sampleErrors: errors.slice(0, 5),
      },
      source: 'cron/log-analysis',
    });

    return res.json({
      ok: true,
      errorCount: errors.length,
      analysis,
    });
  } catch (error) {
    console.error('Log analysis cron error:', error);
    return res.status(500).json({ error: 'Log analysis failed', message: error.message });
  }
}

/**
 * Group errors by path and return top 5 most frequent
 */
function getTopPaths(errors) {
  const pathCounts = {};
  for (const e of errors) {
    pathCounts[e.path] = (pathCounts[e.path] || 0) + 1;
  }
  return Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }));
}
