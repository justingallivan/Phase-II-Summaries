import { useState, useCallback, useRef } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import RequireAppAccess from '../shared/components/RequireAppAccess';
import ErrorAlert from '../shared/components/ErrorAlert';

/**
 * Provider definitions
 */
const PROVIDER_INFO = {
  claude: { name: 'Claude', icon: '🟣', color: 'purple' },
  openai: { name: 'GPT', icon: '🟢', color: 'green' },
  gemini: { name: 'Gemini', icon: '🔵', color: 'blue' },
  perplexity: { name: 'Perplexity', icon: '🟠', color: 'orange' },
};

/**
 * Rating color helper
 */
function getRatingColor(rating) {
  if (!rating) return 'bg-gray-100 text-gray-600';
  const r = rating.toLowerCase();
  if (r.includes('excellent') || r.includes('rewrite textbooks')) return 'bg-green-100 text-green-800';
  if (r.includes('very good') || r.includes('broad interest')) return 'bg-blue-100 text-blue-800';
  if (r.includes('good') || r.includes('disciplinary')) return 'bg-yellow-100 text-yellow-800';
  if (r.includes('fair') || r.includes('medium')) return 'bg-orange-100 text-orange-800';
  if (r.includes('poor') || r.includes('impossible') || r.includes('little')) return 'bg-red-100 text-red-800';
  if (r.includes('low risk')) return 'bg-green-100 text-green-800';
  if (r.includes('high risk')) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
}

/**
 * Provider selector checkboxes
 */
function ProviderSelector({ selected, available, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(PROVIDER_INFO).map(([key, info]) => {
        const isAvailable = available.includes(key);
        const isSelected = selected.includes(key);
        return (
          <label
            key={key}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all
              ${!isAvailable ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50' : ''}
              ${isSelected && isAvailable ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              type="checkbox"
              checked={isSelected}
              disabled={disabled || !isAvailable}
              onChange={() => {
                if (isSelected) {
                  onChange(selected.filter(p => p !== key));
                } else {
                  onChange([...selected, key]);
                }
              }}
              className="sr-only"
            />
            <span className="text-lg">{info.icon}</span>
            <span className="font-medium text-gray-900">{info.name}</span>
            {!isAvailable && <span className="text-xs text-gray-400">(no API key)</span>}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Per-provider status card during processing
 */
function ProviderStatusCard({ provider, status, stage, latencyMs }) {
  const info = PROVIDER_INFO[provider] || { name: provider, icon: '⚪' };

  const statusColors = {
    pending: 'bg-gray-50 border-gray-200',
    in_progress: 'bg-blue-50 border-blue-300 animate-pulse',
    completed: 'bg-green-50 border-green-300',
    failed: 'bg-red-50 border-red-300',
  };

  const statusIcons = {
    pending: '⏳',
    in_progress: '⚙️',
    completed: '✅',
    failed: '❌',
  };

  return (
    <div className={`p-3 rounded-lg border-2 ${statusColors[status] || statusColors.pending}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{info.icon}</span>
          <span className="font-medium text-gray-900">{info.name}</span>
        </div>
        <span>{statusIcons[status] || '⏳'}</span>
      </div>
      {stage && (
        <div className="text-xs text-gray-500 mt-1">
          {stage.replace(/_/g, ' ')}
        </div>
      )}
      {latencyMs && status === 'completed' && (
        <div className="text-xs text-gray-400 mt-1">
          {(latencyMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}

/**
 * Rating comparison matrix
 */
function RatingMatrix({ ratingMatrix, providers }) {
  if (!ratingMatrix) return null;

  const rows = [
    { key: 'impactRating', label: 'Impact' },
    { key: 'riskRating', label: 'Risk' },
    { key: 'overallRating', label: 'Overall' },
  ];

  return (
    <Card title="Rating Comparison Matrix">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 font-medium text-gray-600">Criterion</th>
              {Object.keys(ratingMatrix.overallRating || ratingMatrix.impactRating || {}).map(reviewer => (
                <th key={reviewer} className="text-center py-2 px-3 font-medium text-gray-600">
                  {reviewer}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const ratings = ratingMatrix[row.key];
              if (!ratings) return null;
              return (
                <tr key={row.key} className="border-b border-gray-100">
                  <td className="py-2 px-3 font-medium text-gray-700">{row.label}</td>
                  {Object.entries(ratings).map(([reviewer, rating]) => (
                    <td key={reviewer} className="py-2 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getRatingColor(rating)}`}>
                        {rating}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Individual reviewer card (expandable)
 */
function ReviewerCard({ review }) {
  const [expanded, setExpanded] = useState(false);
  const info = PROVIDER_INFO[review.provider] || { name: review.providerName, icon: '⚪' };
  const parsed = review.parsedResponse;

  if (!parsed) return null;

  const formFields = [
    { key: 'impactRating', label: 'Impact Rating', type: 'rating' },
    { key: 'impactNarrative', label: 'Significant Impacts', type: 'text' },
    { key: 'riskRating', label: 'Risk Rating', type: 'rating' },
    { key: 'riskNarrative', label: 'Risk Analysis', type: 'text' },
    { key: 'methodsAssessment', label: 'Methods Assessment', type: 'text' },
    { key: 'questionsForPI', label: 'Questions for PI', type: 'text' },
    { key: 'teamAssessment', label: 'Team Assessment', type: 'text' },
    { key: 'fundingAlternatives', label: 'Funding Alternatives', type: 'text' },
    { key: 'budgetIssues', label: 'Budget Issues', type: 'text' },
    { key: 'overallRating', label: 'Overall Rating', type: 'rating' },
    { key: 'additionalComments', label: 'Additional Comments', type: 'text' },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{info.icon}</span>
          <span className="font-semibold text-gray-900">{info.name}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRatingColor(parsed.overallRating)}`}>
            {parsed.overallRating || 'N/A'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {review.costCents != null && (
            <span className="text-xs text-gray-400">${(review.costCents / 100).toFixed(4)}</span>
          )}
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-4 bg-gray-50">
          {formFields.map(field => {
            const value = parsed[field.key];
            if (!value) return null;
            return (
              <div key={field.key}>
                <h5 className="text-sm font-medium text-gray-700 mb-1">{field.label}</h5>
                {field.type === 'rating' ? (
                  <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${getRatingColor(value)}`}>
                    {value}
                  </span>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{value}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Panel summary display
 */
function PanelSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Panel Recommendation */}
      {summary.panelRecommendation && (
        <Card title="Panel Recommendation">
          <p className="text-gray-700">{summary.panelRecommendation}</p>
          {summary.confidenceNote && (
            <p className="text-sm text-gray-500 mt-3 italic">{summary.confidenceNote}</p>
          )}
        </Card>
      )}

      {/* Consensus */}
      {summary.consensus?.length > 0 && (
        <Card title="Consensus Points">
          <ul className="space-y-2">
            {summary.consensus.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Disagreements */}
      {summary.disagreements?.length > 0 && (
        <Card title="Disagreements">
          <div className="space-y-4">
            {summary.disagreements.map((d, i) => (
              <div key={i} className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <h5 className="font-medium text-gray-900 mb-2">{d.topic}</h5>
                {d.positions && (
                  <div className="space-y-1 mb-2">
                    {Object.entries(d.positions).map(([reviewer, position]) => (
                      <div key={reviewer} className="text-sm">
                        <span className="font-medium text-gray-700">{reviewer}:</span>{' '}
                        <span className="text-gray-600">{position}</span>
                      </div>
                    ))}
                  </div>
                )}
                {d.significance && (
                  <p className="text-xs text-gray-500 italic">{d.significance}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Questions for PI */}
      {summary.questionsForPI?.length > 0 && (
        <Card title="Questions for the PI">
          <ol className="list-decimal list-inside space-y-2">
            {summary.questionsForPI.map((q, i) => (
              <li key={i} className="text-sm text-gray-700">{q}</li>
            ))}
          </ol>
        </Card>
      )}

      {/* Claim Verification Highlights */}
      {summary.claimVerificationHighlights?.length > 0 && (
        <Card title="Claim Verification Highlights">
          <ul className="space-y-2">
            {summary.claimVerificationHighlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/**
 * Cost breakdown table
 */
function CostBreakdown({ costBreakdown, totalCostCents }) {
  if (!costBreakdown) return null;

  return (
    <Card title="Cost Breakdown">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 font-medium text-gray-600">Provider</th>
            <th className="text-right py-2 font-medium text-gray-600">Cost</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(costBreakdown).map(([provider, cost]) => {
            const info = PROVIDER_INFO[provider] || { name: provider, icon: '⚪' };
            return (
              <tr key={provider} className="border-b border-gray-100">
                <td className="py-2">
                  <span className="mr-2">{info.icon}</span>
                  {info.name}
                </td>
                <td className="py-2 text-right font-mono">${(cost / 100).toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300">
            <td className="py-2 font-semibold">Total</td>
            <td className="py-2 text-right font-mono font-semibold">
              ${((totalCostCents || 0) / 100).toFixed(4)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/**
 * Main Virtual Review Panel component
 */
function VirtualReviewPanelContent() {
  const [files, setFiles] = useState([]);
  const [selectedProviders, setSelectedProviders] = useState(['claude', 'openai']);
  const [includeClaimVerification, setIncludeClaimVerification] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [events, setEvents] = useState([]);
  const [providerStatuses, setProviderStatuses] = useState({});
  const [currentStage, setCurrentStage] = useState(null);
  const [panelSummary, setPanelSummary] = useState(null);
  const [structuredReviews, setStructuredReviews] = useState([]);
  const [claimVerifications, setClaimVerifications] = useState([]);
  const [costBreakdown, setCostBreakdown] = useState(null);
  const [totalCostCents, setTotalCostCents] = useState(null);
  const [availableProviders, setAvailableProviders] = useState(Object.keys(PROVIDER_INFO));
  const eventSourceRef = useRef(null);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0) return;
    if (selectedProviders.length < 2) {
      setError('Please select at least 2 LLM providers');
      return;
    }

    setProcessing(true);
    setError(null);
    setEvents([]);
    setProviderStatuses({});
    setCurrentStage(null);
    setPanelSummary(null);
    setStructuredReviews([]);
    setClaimVerifications([]);
    setCostBreakdown(null);
    setTotalCostCents(null);

    try {
      const response = await fetch('/api/virtual-review-panel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({ url: f.url, filename: f.filename })),
          providers: selectedProviders,
          includeClaimVerification,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            handleEvent(data);
          } catch {
            // Skip malformed events
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          handleEvent(data);
        } catch {
          // Skip
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to review panel API');
    } finally {
      setProcessing(false);
    }
  }, [files, selectedProviders, includeClaimVerification]);

  const handleEvent = useCallback((data) => {
    setEvents(prev => [...prev, data]);

    switch (data.event) {
    case 'progress':
      if (data.providers) {
        setAvailableProviders(data.providers.map(p => p.key));
      }
      break;

    case 'stage_start':
      setCurrentStage(data.stage);
      break;

    case 'provider_start':
      setProviderStatuses(prev => ({
        ...prev,
        [`${data.provider}_${data.stage}`]: { status: 'in_progress', stage: data.stage },
      }));
      break;

    case 'provider_complete':
      setProviderStatuses(prev => ({
        ...prev,
        [`${data.provider}_${data.stage}`]: {
          status: 'completed',
          stage: data.stage,
          latencyMs: data.latencyMs,
        },
      }));

      if (data.stage === 'structured_review') {
        setStructuredReviews(prev => [...prev, {
          provider: data.provider,
          providerName: data.providerName,
          model: data.model,
          parsedResponse: data.parsedResponse,
          costCents: data.costCents,
          latencyMs: data.latencyMs,
        }]);
      } else if (data.stage === 'claim_verification') {
        setClaimVerifications(prev => [...prev, {
          provider: data.provider,
          providerName: data.providerName,
          model: data.model,
          parsedResponse: data.parsedResponse,
          citations: data.citations,
        }]);
      }
      break;

    case 'provider_error':
      setProviderStatuses(prev => ({
        ...prev,
        [`${data.provider}_${data.stage}`]: { status: 'failed', stage: data.stage },
      }));
      break;

    case 'synthesis_complete':
      setCurrentStage('synthesis_complete');
      break;

    case 'complete':
      setPanelSummary(data.panelSummary);
      setCostBreakdown(data.costBreakdown);
      setTotalCostCents(data.totalCostCents);
      break;

    case 'error':
      setError(data.message);
      break;
    }
  }, []);

  const hasResults = panelSummary || structuredReviews.length > 0;

  return (
    <Layout
      title="Virtual Review Panel"
      description="Multi-LLM review panel that evaluates grant proposals against WMKF reviewer criteria"
    >
      <PageHeader
        title="Virtual Review Panel"
        subtitle="Multiple AI models independently review proposals using the WMKF reviewer form, then a panel summary synthesizes their assessments"
      />

      <div className="space-y-6">
        {/* Upload Section */}
        <Card title="Upload Proposal">
          <FileUploaderSimple
            files={files}
            setFiles={setFiles}
            maxFiles={1}
            accept=".pdf"
            disabled={processing}
          />
        </Card>

        {/* Configuration */}
        <Card title="Panel Configuration">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select LLM Reviewers (minimum 2)
              </label>
              <ProviderSelector
                selected={selectedProviders}
                available={availableProviders}
                onChange={setSelectedProviders}
                disabled={processing}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeClaimVerification}
                  onChange={(e) => setIncludeClaimVerification(e.target.checked)}
                  disabled={processing}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Include claim verification (Stage 1) — verifies novelty claims and checks for precedent
                </span>
              </label>
            </div>
          </div>
        </Card>

        {/* Submit */}
        <div className="flex justify-center">
          <Button
            onClick={handleSubmit}
            disabled={processing || files.length === 0 || selectedProviders.length < 2}
            className="px-8 py-3"
          >
            {processing ? 'Running Panel Review...' : 'Run Virtual Review Panel'}
          </Button>
        </div>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Progress Section */}
        {processing && (
          <Card title="Panel Progress">
            <div className="space-y-4">
              {currentStage && (
                <div className="text-sm font-medium text-blue-600 mb-2">
                  Current stage: {currentStage.replace(/_/g, ' ')}
                </div>
              )}

              {/* Claim Verification status */}
              {includeClaimVerification && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Claim Verification</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {selectedProviders.map(p => {
                      const key = `${p}_claim_verification`;
                      const s = providerStatuses[key] || { status: 'pending' };
                      return (
                        <ProviderStatusCard
                          key={key}
                          provider={p}
                          status={s.status}
                          stage="claim verification"
                          latencyMs={s.latencyMs}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Structured Review status */}
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Structured Review</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {selectedProviders.map(p => {
                    const key = `${p}_structured_review`;
                    const s = providerStatuses[key] || { status: 'pending' };
                    return (
                      <ProviderStatusCard
                        key={key}
                        provider={p}
                        status={s.status}
                        stage="structured review"
                        latencyMs={s.latencyMs}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Event log */}
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer">Event log ({events.length} events)</summary>
                <pre className="mt-2 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded">
                  {events.map((e, i) => (
                    <div key={i}>{e.event}: {e.message || e.provider || ''}</div>
                  ))}
                </pre>
              </details>
            </div>
          </Card>
        )}

        {/* Results Section */}
        {hasResults && (
          <div className="space-y-6">
            {/* Rating Matrix */}
            {panelSummary?.ratingMatrix && (
              <RatingMatrix
                ratingMatrix={panelSummary.ratingMatrix}
                providers={structuredReviews.map(r => r.providerName)}
              />
            )}

            {/* Panel Summary */}
            <PanelSummary summary={panelSummary} />

            {/* Individual Reviews */}
            <Card title="Individual Reviewer Assessments">
              <div className="space-y-3">
                {structuredReviews.map((review, i) => (
                  <ReviewerCard key={i} review={review} />
                ))}
              </div>
            </Card>

            {/* Claim Verifications */}
            {claimVerifications.length > 0 && (
              <Card title="Claim Verification Details">
                <div className="space-y-4">
                  {claimVerifications.map((cv, i) => {
                    const info = PROVIDER_INFO[cv.provider] || { name: cv.providerName, icon: '⚪' };
                    return (
                      <details key={i} className="border border-gray-200 rounded-lg">
                        <summary className="p-3 cursor-pointer hover:bg-gray-50 flex items-center gap-2">
                          <span>{info.icon}</span>
                          <span className="font-medium">{info.name}</span>
                          {cv.parsedResponse?.claims && (
                            <span className="text-xs text-gray-400">
                              ({cv.parsedResponse.claims.length} claims analyzed)
                            </span>
                          )}
                        </summary>
                        <div className="p-4 border-t border-gray-200 bg-gray-50">
                          {cv.parsedResponse?.overallNoveltyAssessment && (
                            <p className="text-sm text-gray-700 mb-3">
                              <strong>Novelty Assessment:</strong> {cv.parsedResponse.overallNoveltyAssessment}
                            </p>
                          )}
                          {cv.parsedResponse?.redFlags?.length > 0 && (
                            <div className="mb-3">
                              <strong className="text-sm text-red-700">Red Flags:</strong>
                              <ul className="list-disc list-inside text-sm text-red-600 mt-1">
                                {cv.parsedResponse.redFlags.map((f, j) => (
                                  <li key={j}>{f}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cv.parsedResponse?.claims?.map((claim, j) => (
                            <div key={j} className="mb-2 p-2 bg-white rounded border border-gray-100 text-sm">
                              <div className="font-medium text-gray-800">{claim.claim}</div>
                              <div className="flex gap-2 mt-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  claim.assessment === 'supported' ? 'bg-green-100 text-green-700' :
                                  claim.assessment === 'partially_supported' ? 'bg-yellow-100 text-yellow-700' :
                                  claim.assessment === 'unsupported' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {claim.assessment?.replace('_', ' ')}
                                </span>
                                <span className="text-xs text-gray-400">{claim.category}</span>
                              </div>
                              {claim.reasoning && (
                                <p className="text-xs text-gray-600 mt-1">{claim.reasoning}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Cost Breakdown */}
            <CostBreakdown costBreakdown={costBreakdown} totalCostCents={totalCostCents} />
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function VirtualReviewPanel() {
  return (
    <RequireAppAccess appKey="virtual-review-panel">
      <VirtualReviewPanelContent />
    </RequireAppAccess>
  );
}
