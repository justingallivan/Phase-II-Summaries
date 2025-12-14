/**
 * Expert Reviewer Finder v2
 *
 * A tiered, progressive reviewer discovery system that combines:
 * - Claude's analytical reasoning (the "why")
 * - Real database verification (the "who")
 *
 * Three-tab interface:
 * - Tab 1: New Search - Upload proposal and find reviewers
 * - Tab 2: My Candidates - Saved/selected candidates (placeholder)
 * - Tab 3: Database - Browse researcher database (placeholder)
 */

import { useState, useEffect, useRef } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';

// Tab component
function Tab({ label, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-6 py-3 font-medium text-sm
        border-b-2 transition-all duration-200
        ${active
          ? 'border-gray-900 text-gray-900 bg-gray-50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }
      `}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Progress indicator for stages
function StageProgress({ stages }) {
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${stage.status === 'complete' ? 'bg-green-500 text-white' :
              stage.status === 'active' ? 'bg-blue-500 text-white animate-pulse' :
              stage.status === 'error' ? 'bg-red-500 text-white' :
              'bg-gray-200 text-gray-500'}
          `}>
            {stage.status === 'complete' ? '✓' :
             stage.status === 'error' ? '✗' :
             index + 1}
          </div>
          <span className={`ml-2 text-sm ${
            stage.status === 'active' ? 'text-blue-600 font-medium' :
            stage.status === 'complete' ? 'text-green-600' :
            stage.status === 'error' ? 'text-red-600' :
            'text-gray-400'
          }`}>
            {stage.label}
          </span>
          {index < stages.length - 1 && (
            <div className={`w-12 h-0.5 mx-4 ${
              stage.status === 'complete' ? 'bg-green-300' : 'bg-gray-200'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// Candidate card component
function CandidateCard({ candidate, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const isClaudeSuggestion = candidate.isClaudeSuggestion || candidate.source === 'claude_suggestion';
  const reasoning = candidate.reasoning || candidate.generatedReasoning || 'No reasoning available';

  // Check verification confidence - warn if low
  const confidence = candidate.verificationConfidence;
  const isLowConfidence = confidence !== undefined && confidence < 0.5;

  const hasCoauthorCOI = candidate.hasCoauthorCOI;
  const hasInstitutionCOI = candidate.hasInstitutionCOI;
  const hasAnyCOI = hasCoauthorCOI || hasInstitutionCOI;

  return (
    <div className={`
      border rounded-lg p-4 transition-all duration-200
      ${selected ? 'border-blue-500 bg-blue-50' :
        hasAnyCOI ? 'border-red-300 bg-red-50' :
        isLowConfidence ? 'border-amber-300 bg-amber-50' :
        'border-gray-200 hover:border-gray-300'}
    `}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(candidate)}
          className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-gray-900 truncate">
              {candidate.name}
            </h4>
            <span className={`
              px-2 py-0.5 text-xs rounded-full
              ${candidate.seniorityEstimate === 'Senior' ? 'bg-purple-100 text-purple-700' :
                candidate.seniorityEstimate === 'Mid-career' ? 'bg-blue-100 text-blue-700' :
                'bg-green-100 text-green-700'}
            `}>
              {candidate.seniorityEstimate || 'Unknown'}
            </span>
          </div>

          {candidate.affiliation && (
            <p className="text-sm text-gray-500 truncate">
              {candidate.affiliation}
            </p>
          )}

          {/* Institution COI warning */}
          {candidate.hasInstitutionCOI && (
            <div className="mt-2 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-800">
              <span className="font-medium">🏛️ Institution COI:</span> Same institution as proposal PI
              {candidate.institutionCOIDetails && (
                <span className="ml-1">
                  ({candidate.institutionCOIDetails.reviewerInstitution})
                </span>
              )}
            </div>
          )}

          {/* Coauthor COI warning */}
          {candidate.hasCoauthorCOI && candidate.coauthorships && candidate.coauthorships.length > 0 && (
            <div className="mt-2 p-2 bg-red-50 border border-red-300 rounded text-xs text-red-800">
              <span className="font-medium">🚨 Coauthor COI:</span> Co-authored {
                candidate.coauthorships.reduce((sum, c) => sum + c.paperCount, 0)
              } paper(s) with proposal author(s):
              <ul className="mt-1 ml-4 list-disc">
                {candidate.coauthorships.map((coauth, idx) => (
                  <li key={idx}>
                    <strong>{coauth.proposalAuthor}</strong> ({coauth.paperCount} paper{coauth.paperCount > 1 ? 's' : ''})
                    {coauth.recentPapers && coauth.recentPapers.length > 0 && (
                      <span className="text-red-600"> - e.g., "{coauth.recentPapers[0].title?.substring(0, 60)}..."</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Low confidence warning */}
          {isLowConfidence && (
            <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
              <span className="font-medium">⚠️ Low match confidence ({Math.round(confidence * 100)}%):</span> The publications found may not match Claude's description.
              This could be a different person with the same name. Please verify manually.
            </div>
          )}

          <div className="mt-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Why: </span>
              {expanded ? reasoning : reasoning.substring(0, 150) + (reasoning.length > 150 ? '...' : '')}
            </p>
          </div>

          <div className="mt-2 flex items-center flex-wrap gap-2 text-xs text-gray-500">
            {candidate.verified !== false && (
              <span className="flex items-center gap-1">
                <span className={isLowConfidence ? 'text-amber-500' : 'text-green-500'}>
                  {isLowConfidence ? '⚠' : '✓'}
                </span>
                {candidate.publicationCount5yr || candidate.publications?.length || 0} publications
                {confidence !== undefined && (
                  <span className="text-gray-400">
                    ({Math.round(confidence * 100)}% match)
                  </span>
                )}
              </span>
            )}
            <span className={`
              px-2 py-0.5 rounded-full
              ${isClaudeSuggestion ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}
            `}>
              {isClaudeSuggestion ? 'Claude suggestion' : candidate.source || 'Database'}
            </span>
          </div>

          {candidate.publications && candidate.publications.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800"
            >
              {expanded ? 'Show less' : `View ${candidate.publications.length} papers`}
            </button>
          )}

          {expanded && candidate.publications && (
            <div className="mt-2 space-y-1">
              {candidate.publications.map((pub, i) => (
                <div key={i} className="text-xs text-gray-600">
                  • {pub.title} ({pub.year || 'N/A'})
                  {pub.url && (
                    <a href={pub.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500">
                      [Link]
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// New Search Tab content
function NewSearchTab({ apiKey, onCandidatesSaved }) {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [excludedNames, setExcludedNames] = useState('');
  const [searchSources, setSearchSources] = useState({
    pubmed: true,
    arxiv: true,
    biorxiv: true
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStage, setCurrentStage] = useState(null);
  const [progressMessages, setProgressMessages] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState(new Set());
  const [error, setError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  const progressRef = useRef(null);

  const stages = [
    { id: 'analysis', label: 'Claude Analysis', status: currentStage === 'analysis' ? 'active' : analysisResult ? 'complete' : 'pending' },
    { id: 'discovery', label: 'Database Discovery', status: currentStage === 'discovery' ? 'active' : discoveryResult ? 'complete' : 'pending' },
    { id: 'results', label: 'Results', status: discoveryResult ? 'complete' : 'pending' }
  ];

  // Auto-scroll progress
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [progressMessages]);

  const handleFilesUploaded = (files) => {
    setUploadedFiles(files);
    setError(null);
    // Reset results when new file uploaded
    setAnalysisResult(null);
    setDiscoveryResult(null);
    setSelectedCandidates(new Set());
  };

  const addProgressMessage = (message) => {
    setProgressMessages(prev => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  };

  const runAnalysis = async () => {
    if (uploadedFiles.length === 0) {
      setError('Please upload a proposal PDF first');
      return;
    }

    if (!apiKey) {
      setError('Please enter your Claude API key');
      return;
    }

    setIsProcessing(true);
    setCurrentStage('analysis');
    setProgressMessages([]);
    setError(null);
    setAnalysisResult(null);
    setDiscoveryResult(null);

    try {
      // Stage 1: Claude Analysis
      addProgressMessage('Starting Claude analysis...');

      const response = await fetch('/api/reviewer-finder/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          blobUrl: uploadedFiles[0].url,
          additionalNotes,
          excludedNames: excludedNames.split(',').map(n => n.trim()).filter(Boolean)
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let analysisData = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.slice(7);
            // Next line should be data
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                addProgressMessage(data.message);
              }
              if (data.proposalInfo) {
                analysisData = data;
              }
              if (data.error) {
                throw new Error(data.error || data.message);
              }
            } catch (e) {
              if (e.message !== 'Unexpected end of JSON input') {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }

      if (!analysisData) {
        throw new Error('Analysis did not return results');
      }

      setAnalysisResult(analysisData);
      addProgressMessage(`Found ${analysisData.reviewerSuggestions?.length || 0} Claude suggestions`);

      // Stage 2: Database Discovery
      setCurrentStage('discovery');
      addProgressMessage('Starting database discovery...');

      const discoverResponse = await fetch('/api/reviewer-finder/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          analysisResult: analysisData,
          options: {
            searchPubmed: searchSources.pubmed,
            searchArxiv: searchSources.arxiv,
            searchBiorxiv: searchSources.biorxiv,
            generateReasoning: true
          }
        })
      });

      const discoverReader = discoverResponse.body.getReader();
      let discoveryData = null;

      while (true) {
        const { done, value } = await discoverReader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                addProgressMessage(data.message);
              }
              if (data.ranked) {
                discoveryData = data;
              }
              if (data.error) {
                throw new Error(data.error || data.message);
              }
            } catch (e) {
              if (e.message !== 'Unexpected end of JSON input') {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }

      if (discoveryData) {
        setDiscoveryResult(discoveryData);
        addProgressMessage(`Discovery complete: ${discoveryData.verified?.length || 0} verified, ${discoveryData.discovered?.length || 0} discovered`);
      }

      setCurrentStage('results');

    } catch (err) {
      console.error('Processing error:', err);
      setError(err.message);
      addProgressMessage(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleCandidate = (candidate) => {
    const newSelected = new Set(selectedCandidates);
    const key = candidate.name;
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedCandidates(newSelected);
  };

  const allCandidates = discoveryResult?.ranked || [];
  const verifiedCount = discoveryResult?.verified?.length || 0;
  const discoveredCount = discoveryResult?.discovered?.length || 0;

  // Get selected candidate objects
  const getSelectedCandidateObjects = () => {
    return allCandidates.filter(c => selectedCandidates.has(c.name));
  };

  // Generate a unique proposal ID from the title and timestamp
  const generateProposalId = () => {
    const title = analysisResult?.proposalInfo?.title || 'untitled';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    const timestamp = Date.now();
    return `${slug}-${timestamp}`;
  };

  // Save candidates to database
  const handleSaveCandidates = async () => {
    const selected = getSelectedCandidateObjects();
    if (selected.length === 0) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/reviewer-finder/save-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: generateProposalId(),
          proposalTitle: analysisResult?.proposalInfo?.title || 'Untitled Proposal',
          candidates: selected
        })
      });

      const result = await response.json();

      if (result.success) {
        setSaveMessage({
          type: 'success',
          text: `Saved ${result.savedCount} candidate(s) to My Candidates`
        });
        // Notify parent to refresh My Candidates tab
        if (onCandidatesSaved) {
          onCandidatesSaved();
        }
      } else {
        setSaveMessage({
          type: 'error',
          text: result.error || 'Failed to save candidates'
        });
      }
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err.message || 'Failed to save candidates'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Export selected candidates as Markdown
  const exportAsMarkdown = () => {
    const selected = getSelectedCandidateObjects();
    if (selected.length === 0) return;

    const proposalTitle = analysisResult?.proposalInfo?.title || 'Untitled Proposal';
    const date = new Date().toLocaleDateString();

    let markdown = `# Expert Reviewers for "${proposalTitle}"\n\n`;
    markdown += `Generated: ${date}\n\n`;
    markdown += `---\n\n`;
    markdown += `## Selected Candidates (${selected.length})\n\n`;

    selected.forEach((candidate, index) => {
      markdown += `### ${index + 1}. ${candidate.name}\n\n`;

      if (candidate.affiliation) {
        markdown += `**Affiliation:** ${candidate.affiliation}\n\n`;
      }

      const isClaudeSuggestion = candidate.isClaudeSuggestion || candidate.source === 'claude_suggestion';
      markdown += `**Source:** ${isClaudeSuggestion ? 'Claude suggestion (verified)' : candidate.source || 'Database discovery'}\n\n`;

      if (candidate.seniorityEstimate) {
        markdown += `**Seniority:** ${candidate.seniorityEstimate}\n\n`;
      }

      const reasoning = candidate.reasoning || candidate.generatedReasoning;
      if (reasoning) {
        markdown += `**Why this reviewer:** ${reasoning}\n\n`;
      }

      // COI Warnings
      if (candidate.hasInstitutionCOI) {
        markdown += `**🏛️ Institution COI:** Same institution as proposal PI`;
        if (candidate.institutionCOIDetails?.reviewerInstitution) {
          markdown += ` (${candidate.institutionCOIDetails.reviewerInstitution})`;
        }
        markdown += '\n\n';
      }

      if (candidate.hasCoauthorCOI && candidate.coauthorships) {
        markdown += `**🚨 Coauthor COI:** Has co-authored papers with proposal authors:\n`;
        candidate.coauthorships.forEach(coauth => {
          markdown += `- ${coauth.paperCount} paper(s) with ${coauth.proposalAuthor}\n`;
        });
        markdown += '\n';
      }

      // Publications
      if (candidate.publications && candidate.publications.length > 0) {
        markdown += `**Recent Publications (${candidate.publications.length}):**\n`;
        candidate.publications.slice(0, 5).forEach(pub => {
          const url = pub.url || (pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}` : '');
          if (url) {
            markdown += `- [${pub.title}](${url}) (${pub.year || 'N/A'})\n`;
          } else {
            markdown += `- ${pub.title} (${pub.year || 'N/A'})\n`;
          }
        });
        markdown += '\n';
      }

      markdown += `---\n\n`;
    });

    // Download the file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewers-${proposalTitle.replace(/[^a-z0-9]/gi, '-').substring(0, 30)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export selected candidates as CSV
  const exportAsCSV = () => {
    const selected = getSelectedCandidateObjects();
    if (selected.length === 0) return;

    const proposalTitle = analysisResult?.proposalInfo?.title || 'Untitled Proposal';

    // CSV header
    let csv = 'Name,Affiliation,Source,Seniority,Publications_5yr,COI_Warning,Reasoning\n';

    selected.forEach(candidate => {
      const isClaudeSuggestion = candidate.isClaudeSuggestion || candidate.source === 'claude_suggestion';
      const source = isClaudeSuggestion ? 'Claude suggestion' : (candidate.source || 'Database');
      const pubCount = candidate.publicationCount5yr || candidate.publications?.length || 0;

      // Build COI warning string
      const coiParts = [];
      if (candidate.hasInstitutionCOI) coiParts.push('Institution COI');
      if (candidate.hasCoauthorCOI) coiParts.push('Coauthor COI');
      const coiWarning = coiParts.length > 0 ? coiParts.join(', ') : 'No';

      const reasoning = (candidate.reasoning || candidate.generatedReasoning || '').replace(/"/g, '""');

      csv += `"${candidate.name}","${candidate.affiliation || ''}","${source}","${candidate.seniorityEstimate || ''}",${pubCount},"${coiWarning}","${reasoning}"\n`;
    });

    // Download the file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewers-${proposalTitle.replace(/[^a-z0-9]/gi, '-').substring(0, 30)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle export with format selection
  const handleExportSelected = () => {
    // For now, export both formats. Could add a dropdown later.
    exportAsMarkdown();
  };

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">Upload Proposal</h3>

        <FileUploaderSimple
          onFilesUploaded={handleFilesUploaded}
          multiple={false}
          accept=".pdf"
        />

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Context (optional)
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Any specific requirements or context for reviewer selection..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excluded Names (conflicts of interest)
            </label>
            <input
              type="text"
              value={excludedNames}
              onChange={(e) => setExcludedNames(e.target.value)}
              placeholder="John Smith, Jane Doe (comma-separated)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Sources
            </label>
            <div className="flex gap-4">
              {['pubmed', 'arxiv', 'biorxiv'].map((source) => (
                <label key={source} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={searchSources[source]}
                    onChange={(e) => setSearchSources(prev => ({ ...prev, [source]: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 capitalize">{source}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <Button
            onClick={runAnalysis}
            disabled={isProcessing || uploadedFiles.length === 0 || !apiKey}
            loading={isProcessing}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : 'Find Reviewers'}
          </Button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </Card>

      {/* Progress Section */}
      {(isProcessing || progressMessages.length > 0) && (
        <Card>
          <h3 className="text-lg font-semibold mb-4">Progress</h3>
          <StageProgress stages={stages} />

          <div
            ref={progressRef}
            className="mt-4 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs"
          >
            {progressMessages.map((msg, i) => (
              <div key={i} className="text-gray-600">
                <span className="text-gray-400">[{msg.time}]</span> {msg.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Results Section */}
      {discoveryResult && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Results ({allCandidates.length} candidates)
            </h3>
            <div className="text-sm text-gray-500">
              {verifiedCount} verified • {discoveredCount} discovered
            </div>
          </div>

          {analysisResult?.proposalInfo && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Proposal:</strong> {analysisResult.proposalInfo.title || 'Untitled'}
              </p>
              {analysisResult.proposalInfo.primaryResearchArea && (
                <p className="text-sm text-gray-500">
                  {analysisResult.proposalInfo.primaryResearchArea}
                </p>
              )}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {selectedCandidates.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidates(new Set(allCandidates.map(c => c.name)))}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidates(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Claude Suggestions Section */}
          {verifiedCount > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
                  Claude Suggestions
                </span>
                <span className="text-gray-400">({verifiedCount} verified)</span>
              </h4>
              <div className="space-y-3">
                {allCandidates
                  .filter(c => c.isClaudeSuggestion || c.source === 'claude_suggestion')
                  .map((candidate, i) => (
                    <CandidateCard
                      key={candidate.name + i}
                      candidate={candidate}
                      selected={selectedCandidates.has(candidate.name)}
                      onSelect={toggleCandidate}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Discovered Section */}
          {discoveredCount > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                  Database Discoveries
                </span>
                <span className="text-gray-400">({discoveredCount} found)</span>
              </h4>
              <div className="space-y-3">
                {allCandidates
                  .filter(c => !c.isClaudeSuggestion && c.source !== 'claude_suggestion')
                  .map((candidate, i) => (
                    <CandidateCard
                      key={candidate.name + i}
                      candidate={candidate}
                      selected={selectedCandidates.has(candidate.name)}
                      onSelect={toggleCandidate}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {selectedCandidates.size > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              {saveMessage && (
                <div className={`mb-3 p-2 rounded text-sm ${
                  saveMessage.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {saveMessage.type === 'success' ? '✓ ' : '✗ '}
                  {saveMessage.text}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={handleSaveCandidates}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : `Save to My Candidates (${selectedCandidates.size})`}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={exportAsMarkdown}>
                    Export Markdown
                  </Button>
                  <Button variant="outline" onClick={exportAsCSV}>
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Unverified Section */}
      {discoveryResult?.unverified?.length > 0 && (
        <Card className="bg-gray-50">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-600">
              Unverified Suggestions ({discoveryResult.unverified.length})
            </summary>
            <div className="mt-3 space-y-2">
              {discoveryResult.unverified.map((candidate, i) => (
                <div key={i} className="text-sm text-gray-500">
                  <span className="font-medium">{candidate.name}</span>
                  <span className="ml-2 text-gray-400">— {candidate.reason}</span>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}

// Saved Candidate Card (simpler than search results)
function SavedCandidateCard({ candidate, onUpdate, onRemove }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(candidate.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const handleToggleInvited = async () => {
    await onUpdate(candidate.suggestionId, { invited: !candidate.invited });
  };

  const handleToggleAccepted = async () => {
    await onUpdate(candidate.suggestionId, { accepted: !candidate.accepted });
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    await onUpdate(candidate.suggestionId, { notes });
    setIsSavingNotes(false);
  };

  const hasCoauthorCOI = candidate.reasoning?.includes('[COI WARNING');
  const hasInstitutionCOI = candidate.reasoning?.includes('Institution COI') || candidate.hasInstitutionCOI;
  const hasAnyCOI = hasCoauthorCOI || hasInstitutionCOI;

  return (
    <div className={`border rounded-lg p-4 ${hasAnyCOI ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{candidate.name}</h4>
            {candidate.hIndex && (
              <span className="text-xs text-gray-500">h-index: {candidate.hIndex}</span>
            )}
          </div>
          {candidate.affiliation && (
            <p className="text-sm text-gray-500 truncate">{candidate.affiliation}</p>
          )}
          {hasAnyCOI && (
            <p className="text-xs text-red-600 mt-1">
              {hasInstitutionCOI && '🏛️ Institution COI'}
              {hasInstitutionCOI && hasCoauthorCOI && ' • '}
              {hasCoauthorCOI && '🚨 Coauthor COI'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleInvited}
            className={`px-2 py-1 text-xs rounded ${
              candidate.invited
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {candidate.invited ? '✓ Invited' : 'Invited'}
          </button>
          <button
            onClick={handleToggleAccepted}
            className={`px-2 py-1 text-xs rounded ${
              candidate.accepted
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {candidate.accepted ? '✓ Accepted' : 'Accepted'}
          </button>
          <button
            onClick={() => onRemove(candidate.suggestionId)}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600"
            title="Remove from list"
          >
            ✕
          </button>
        </div>
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
      >
        {isExpanded ? 'Hide details' : 'Show details'}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {candidate.reasoning && (
            <div>
              <p className="text-xs font-medium text-gray-600">Why this reviewer:</p>
              <p className="text-sm text-gray-700">{candidate.reasoning}</p>
            </div>
          )}

          {candidate.email && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">Email:</span>{' '}
              <a href={`mailto:${candidate.email}`} className="text-blue-600">{candidate.email}</a>
            </p>
          )}

          {candidate.website && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">Website:</span>{' '}
              <a href={candidate.website} target="_blank" rel="noopener noreferrer" className="text-blue-600">
                {candidate.website}
              </a>
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600">Notes:</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <button
                onClick={handleSaveNotes}
                disabled={isSavingNotes || notes === candidate.notes}
                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                {isSavingNotes ? '...' : 'Save'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Saved: {new Date(candidate.savedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

// My Candidates Tab
function MyCandidatesTab({ refreshTrigger }) {
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCandidates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reviewer-finder/my-candidates');
      const data = await response.json();
      if (data.success) {
        setProposals(data.proposals);
      } else {
        setError(data.error || 'Failed to fetch candidates');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [refreshTrigger]);

  const handleUpdateCandidate = async (suggestionId, updates) => {
    try {
      await fetch('/api/reviewer-finder/my-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, ...updates })
      });
      // Refresh to get updated data
      fetchCandidates();
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const handleRemoveCandidate = async (suggestionId) => {
    if (!confirm('Remove this candidate from your list?')) return;
    try {
      await fetch('/api/reviewer-finder/my-candidates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId })
      });
      fetchCandidates();
    } catch (err) {
      console.error('Remove failed:', err);
    }
  };

  if (isLoading) {
    return (
      <Card className="text-center py-12">
        <div className="animate-spin text-4xl mb-4">⏳</div>
        <p className="text-gray-500">Loading saved candidates...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchCandidates} className="mt-4">Retry</Button>
      </Card>
    );
  }

  if (proposals.length === 0) {
    return (
      <Card className="text-center py-12">
        <div className="text-6xl mb-4">📋</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Saved Candidates</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Run a search and save candidates to build your reviewer list.
          They'll appear here organized by proposal.
        </p>
      </Card>
    );
  }

  const totalCandidates = proposals.reduce((sum, p) => sum + p.candidates.length, 0);
  const invitedCount = proposals.reduce((sum, p) =>
    sum + p.candidates.filter(c => c.invited).length, 0);
  const acceptedCount = proposals.reduce((sum, p) =>
    sum + p.candidates.filter(c => c.accepted).length, 0);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">My Saved Candidates</h3>
            <p className="text-sm text-gray-500">
              {totalCandidates} candidate(s) across {proposals.length} proposal(s)
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-blue-600">{invitedCount} invited</span>
            <span className="text-green-600">{acceptedCount} accepted</span>
          </div>
        </div>
      </Card>

      {/* Proposals with Candidates */}
      {proposals.map((proposal) => (
        <Card key={proposal.proposalId}>
          <h4 className="font-medium text-gray-900 mb-1">
            {proposal.proposalTitle}
          </h4>
          <p className="text-xs text-gray-400 mb-4">
            {proposal.candidates.length} candidate(s)
          </p>

          <div className="space-y-3">
            {proposal.candidates.map((candidate) => (
              <SavedCandidateCard
                key={candidate.suggestionId}
                candidate={candidate}
                onUpdate={handleUpdateCandidate}
                onRemove={handleRemoveCandidate}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// Database Tab (placeholder)
function DatabaseTab() {
  return (
    <Card className="text-center py-12">
      <div className="text-6xl mb-4">🗄️</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Researcher Database</h3>
      <p className="text-gray-500 max-w-md mx-auto">
        Browse and search the growing database of researchers discovered
        across your searches. This feature is coming soon in Phase 4.
      </p>
      <div className="mt-6">
        <span className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-full text-sm">
          <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
          Coming Soon
        </span>
      </div>
    </Card>
  );
}

// Main Page Component
export default function ReviewerFinderPage() {
  const [activeTab, setActiveTab] = useState('search');
  const [apiKey, setApiKey] = useState('');
  const [myCandidatesRefresh, setMyCandidatesRefresh] = useState(0);

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('claudeApiKey');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Callback to trigger refresh of My Candidates tab
  const handleCandidatesSaved = () => {
    setMyCandidatesRefresh(prev => prev + 1);
  };

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('claudeApiKey', key);
  };

  const tabs = [
    { id: 'search', label: 'New Search', icon: '🔍' },
    { id: 'candidates', label: 'My Candidates', icon: '📋' },
    { id: 'database', label: 'Database', icon: '🗄️' }
  ];

  return (
    <Layout
      title="Expert Reviewer Finder"
      description="Find qualified peer reviewers using AI analysis and academic database verification"
    >
      <PageHeader
        title="Expert Reviewer Finder"
        subtitle="Combine Claude's analytical reasoning with real database verification to find qualified reviewers"
        icon="🎯"
      />

      <div className="py-8 space-y-6">
        {/* API Key Input */}
        <Card>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Claude API Key:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={handleApiKeyChange}
              placeholder="sk-ant-..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {apiKey && (
              <span className="text-green-500 text-sm">✓ Saved</span>
            )}
          </div>
        </Card>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <div className="flex">
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                label={tab.label}
                icon={tab.icon}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'search' && <NewSearchTab apiKey={apiKey} onCandidatesSaved={handleCandidatesSaved} />}
          {activeTab === 'candidates' && <MyCandidatesTab refreshTrigger={myCandidatesRefresh} />}
          {activeTab === 'database' && <DatabaseTab />}
        </div>
      </div>
    </Layout>
  );
}
