import { useState, useCallback } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';

/**
 * Rating badge component
 */
function RatingBadge({ rating, label }) {
  const colorMap = {
    'Strong': 'bg-green-100 text-green-800 border-green-200',
    'Moderate': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Weak': 'bg-red-100 text-red-800 border-red-200'
  };

  const color = colorMap[rating] || 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">{label}:</span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
        {rating || 'N/A'}
      </span>
    </div>
  );
}

/**
 * Single concept result card
 */
function ConceptCard({ concept, index }) {
  const [expanded, setExpanded] = useState(false);

  if (concept.error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
        <div className="bg-red-50 p-4 border-b border-red-200">
          <h3 className="text-base font-medium text-gray-900">
            Concept {concept.pageNumber || index + 1}: Error
          </h3>
        </div>
        <div className="p-4">
          <p className="text-red-600">{concept.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 p-4 border-b border-gray-200">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-medium text-gray-900 truncate">
              {concept.pageNumber ? `${concept.pageNumber}. ` : ''}{concept.title || 'Untitled Concept'}
            </h3>
            {concept.piName && (
              <p className="text-sm text-gray-600 mt-1">
                {concept.piName}{concept.institution ? ` - ${concept.institution}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      </div>

      {/* Ratings Row */}
      <div className="px-4 py-3 bg-gray-25 border-b border-gray-100 flex flex-wrap gap-4">
        <RatingBadge
          rating={concept.potentialImpact?.rating}
          label="Impact"
        />
        <RatingBadge
          rating={concept.keckAlignment?.rating}
          label="Keck Fit"
        />
        <RatingBadge
          rating={concept.scientificMerit?.rating}
          label="Merit"
        />
        <RatingBadge
          rating={concept.noveltyAssessment?.rating}
          label="Novelty"
        />
        <RatingBadge
          rating={concept.feasibility?.rating}
          label="Feasibility"
        />
      </div>

      {/* Summary */}
      <div className="p-4">
        <p className="text-gray-700 text-sm leading-relaxed">
          {concept.overallAssessment || concept.summary || 'No assessment available'}
        </p>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
            {/* Potential Impact - Primary */}
            {concept.potentialImpact?.reasoning && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Potential Impact (if successful)</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.potentialImpact.reasoning}</p>
              </div>
            )}

            {/* Detailed Ratings */}
            {concept.keckAlignment?.reasoning && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Keck Alignment</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.keckAlignment.reasoning}</p>
              </div>
            )}

            {concept.scientificMerit?.reasoning && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Scientific Merit</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.scientificMerit.reasoning}</p>
              </div>
            )}

            {concept.noveltyAssessment?.reasoning && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Novelty Assessment</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.noveltyAssessment.reasoning}</p>
              </div>
            )}

            {concept.feasibility?.reasoning && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Feasibility</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.feasibility.reasoning}</p>
              </div>
            )}

            {/* Strengths */}
            {concept.strengths?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Strengths</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                  {concept.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {/* Concerns */}
            {concept.concerns?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Concerns</h4>
                <ul className="list-disc list-inside text-sm text-gray-600 mt-1">
                  {concept.concerns.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}

            {/* Literature Search Results */}
            {concept.literatureSearch && (
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Literature Search Results
                </h4>
                <div className="text-xs text-gray-500 mb-2">
                  <div>
                    <span className="font-medium">Queries:</span>{' '}
                    {concept.literatureSearch.queries?.length > 0
                      ? concept.literatureSearch.queries.map((q, i) => (
                          <span key={i} className="inline-block bg-gray-200 rounded px-1 mr-1 mb-1">"{q}"</span>
                        ))
                      : 'N/A'}
                  </div>
                  <div className="mt-1">
                    <span className="font-medium">Area:</span> {concept.literatureSearch.researchArea || 'N/A'}
                    {' | '}
                    <span className="font-medium">Found:</span> {concept.literatureSearch.totalFound || 0} publications
                  </div>
                </div>

                {concept.literatureSearch.publications?.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2">
                    {concept.literatureSearch.publications.map((pub, i) => (
                      <div key={i} className="text-xs text-gray-600 py-1 border-b border-gray-100 last:border-0">
                        <div className="font-medium text-gray-800">
                          {pub.url ? (
                            <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {pub.title}
                            </a>
                          ) : (
                            pub.title
                          )}
                        </div>
                        <div className="text-gray-500">
                          {pub.authors?.slice(0, 3).join(', ')}{pub.authors?.length > 3 ? ' et al.' : ''}
                          {pub.year ? ` (${pub.year})` : ''}
                          {pub.source ? ` - ${pub.source}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">No publications found in searched databases</p>
                )}
              </div>
            )}

            {/* Literature Context Summary */}
            {concept.literatureContext?.keyFindings && (
              <div>
                <h4 className="text-sm font-medium text-gray-900">Literature Context Summary</h4>
                <p className="text-sm text-gray-600 mt-1">{concept.literatureContext.keyFindings}</p>
              </div>
            )}

            {/* Research Area */}
            {concept.researchArea && (
              <div className="pt-2 text-xs text-gray-500">
                Research Area: {concept.researchArea}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConceptEvaluator() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);

  const handleApiKeySet = useCallback((key) => {
    setApiKey(key);
    setError(null);
  }, []);

  const handleFilesUploaded = useCallback((uploadedFiles) => {
    setSelectedFiles(uploadedFiles);
    setError(null);
    setResults(null);
  }, []);

  const evaluateConcepts = async () => {
    if (!apiKey) {
      setError('Please provide an API key');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Please upload a PDF file containing concepts');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting concept evaluation...');
    setError(null);

    try {
      const response = await fetch('/api/evaluate-concepts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          files: selectedFiles,
          apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line && line.startsWith('data: ')) {
            try {
              const jsonString = line.slice(6).trim();
              if (jsonString && jsonString !== '' && jsonString !== 'null') {
                const data = JSON.parse(jsonString);

                if (data && typeof data === 'object') {
                  if (typeof data.progress === 'number') {
                    setProgress(data.progress);
                  }
                  if (data.message) {
                    setProgressText(String(data.message));
                  }
                  if (data.results) {
                    setResults(data.results);
                  }
                }
              }
            } catch (parseError) {
              continue;
            }
          }
        }
      }

      setProgressText('Evaluation complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Evaluation error:', error);
      setError(error.message || 'Failed to evaluate concepts');
    } finally {
      setProcessing(false);
    }
  };

  const exportAsJson = () => {
    if (!results) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `concept_evaluation_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsMarkdown = () => {
    if (!results?.concepts) return;

    let content = `# Concept Evaluation Report\n\n`;
    content += `Generated: ${new Date().toLocaleDateString()}\n`;
    content += `Total Concepts: ${results.summary?.totalConcepts || results.concepts.length}\n`;
    content += `Successful Evaluations: ${results.summary?.successfulEvaluations || 0}\n\n`;
    content += `---\n\n`;

    results.concepts.forEach((concept, index) => {
      content += `## ${index + 1}. ${concept.title || 'Untitled Concept'}\n\n`;

      if (concept.error) {
        content += `**Error:** ${concept.error}\n\n`;
      } else {
        if (concept.piName) {
          content += `**PI:** ${concept.piName}`;
          if (concept.institution) content += ` (${concept.institution})`;
          content += `\n\n`;
        }

        content += `### Ratings\n\n`;
        content += `| Criterion | Rating |\n`;
        content += `|-----------|--------|\n`;
        content += `| Potential Impact | ${concept.potentialImpact?.rating || 'N/A'} |\n`;
        content += `| Keck Alignment | ${concept.keckAlignment?.rating || 'N/A'} |\n`;
        content += `| Scientific Merit | ${concept.scientificMerit?.rating || 'N/A'} |\n`;
        content += `| Novelty | ${concept.noveltyAssessment?.rating || 'N/A'} |\n`;
        content += `| Feasibility | ${concept.feasibility?.rating || 'N/A'} |\n\n`;

        if (concept.overallAssessment) {
          content += `### Overall Assessment\n\n${concept.overallAssessment}\n\n`;
        }

        if (concept.potentialImpact?.reasoning) {
          content += `### Potential Impact (if successful)\n\n${concept.potentialImpact.reasoning}\n\n`;
        }

        if (concept.keckAlignment?.reasoning) {
          content += `### Keck Alignment\n\n${concept.keckAlignment.reasoning}\n\n`;
        }

        if (concept.scientificMerit?.reasoning) {
          content += `### Scientific Merit\n\n${concept.scientificMerit.reasoning}\n\n`;
        }

        if (concept.noveltyAssessment?.reasoning) {
          content += `### Novelty Assessment\n\n${concept.noveltyAssessment.reasoning}\n\n`;
        }

        if (concept.feasibility?.reasoning) {
          content += `### Feasibility\n\n${concept.feasibility.reasoning}\n\n`;
        }

        // Literature Search Results
        if (concept.literatureSearch) {
          content += `### Literature Search\n\n`;
          content += `**Queries:** ${concept.literatureSearch.queries?.join(', ') || 'N/A'}\n`;
          content += `**Research Area:** ${concept.literatureSearch.researchArea || 'N/A'}\n`;
          content += `**Publications Found:** ${concept.literatureSearch.totalFound || 0}\n\n`;

          if (concept.literatureSearch.publications?.length > 0) {
            content += `**Sample Publications:**\n\n`;
            concept.literatureSearch.publications.slice(0, 10).forEach(pub => {
              const authors = pub.authors?.slice(0, 3).join(', ') || 'Unknown';
              const authorsStr = pub.authors?.length > 3 ? `${authors} et al.` : authors;
              const title = pub.url ? `[${pub.title}](${pub.url})` : pub.title;
              content += `- ${title} (${pub.year || 'N/A'}) - ${authorsStr} [${pub.source || 'Unknown'}]\n`;
            });
            content += `\n`;
          }
        }

        if (concept.literatureContext?.keyFindings) {
          content += `### Literature Context Summary\n\n${concept.literatureContext.keyFindings}\n\n`;
        }

        if (concept.strengths?.length > 0) {
          content += `### Strengths\n\n`;
          concept.strengths.forEach(s => content += `- ${s}\n`);
          content += `\n`;
        }

        if (concept.concerns?.length > 0) {
          content += `### Concerns\n\n`;
          concept.concerns.forEach(c => content += `- ${c}\n`);
          content += `\n`;
        }
      }

      content += `---\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `concept_evaluation_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Count ratings for summary
  const countRatings = (concepts, field) => {
    const counts = { Strong: 0, Moderate: 0, Weak: 0 };
    concepts?.forEach(c => {
      const rating = c[field]?.rating;
      if (rating && counts.hasOwnProperty(rating)) {
        counts[rating]++;
      }
    });
    return counts;
  };

  return (
    <Layout
      title="Concept Evaluator"
      description="Screen research concepts with AI analysis and literature search"
    >
      <PageHeader
        title="Concept Evaluator"
        subtitle="Screen research concepts with AI-powered analysis and automated literature search"
        icon="🔬"
      />

      <Card className="mb-8">
        <div className="text-center">
          <ApiKeyManager
            onApiKeySet={handleApiKeySet}
            required={true}
            appKey="concept-evaluator"
          />
        </div>
      </Card>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <span className="text-red-600 text-xl">⚠️</span>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {/* Instructions */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📋</span>
            <span>How It Works</span>
          </h2>
          <div className="text-gray-700 space-y-2">
            <p>1. Upload a PDF where each page contains one research concept</p>
            <p>2. Claude analyzes each concept and extracts key information</p>
            <p>3. Literature is searched to assess novelty and context</p>
            <p>4. Each concept receives ratings for impact, Keck alignment, merit, novelty, and feasibility</p>
            <p>5. Export results as JSON or Markdown for further review</p>
          </div>
        </Card>

        {/* File Upload */}
        <Card>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>📁</span>
              <span>Upload Concepts PDF</span>
            </h2>
            <p className="text-sm text-gray-600">
              Upload a PDF file where each page contains one research concept
            </p>
          </div>
          <FileUploaderSimple
            onFilesUploaded={handleFilesUploaded}
            multiple={true}
            accept=".pdf"
            maxSize={50 * 1024 * 1024}
          />
        </Card>

        {/* Ready State */}
        {selectedFiles.length > 0 && !processing && !results && (
          <Card className="bg-green-50 border-green-200">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Evaluate</h3>
              <p className="text-gray-700 mb-4">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} uploaded
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={evaluateConcepts}
              >
                🚀 Evaluate Concepts
              </Button>
            </div>
          </Card>
        )}

        {/* Processing State */}
        {processing && (
          <Card>
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
                <span className="text-gray-700 font-medium">{progressText}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-sm text-gray-600">{progress}%</div>
            </div>
          </Card>
        )}

        {/* Results */}
        {results?.concepts && (
          <Card className="mt-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <span>📊</span>
                <span>Evaluation Results</span>
              </h2>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={exportAsJson}>
                  📋 Export JSON
                </Button>
                <Button variant="secondary" onClick={exportAsMarkdown}>
                  📝 Export Markdown
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {results.concepts.length}
                  </div>
                  <div className="text-sm text-gray-600">Concepts</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {countRatings(results.concepts, 'potentialImpact').Strong}
                  </div>
                  <div className="text-sm text-gray-600">High Impact</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {countRatings(results.concepts, 'potentialImpact').Moderate}
                  </div>
                  <div className="text-sm text-gray-600">Moderate Impact</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {results.summary?.errors || 0}
                  </div>
                  <div className="text-sm text-gray-600">Errors</div>
                </div>
              </div>
            </div>

            {/* Concept Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {results.concepts.map((concept, index) => (
                <ConceptCard key={index} concept={concept} index={index} />
              ))}
            </div>
          </Card>
        )}

        {/* New Evaluation Button */}
        {results && !processing && (
          <div className="flex justify-center mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setResults(null);
                setProgress(0);
                setProgressText('');
              }}
            >
              🔬 New Evaluation
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
