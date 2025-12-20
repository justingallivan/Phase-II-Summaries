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
import ApiSettingsPanel from '../shared/components/ApiSettingsPanel';
import EmailSettingsPanel from '../shared/components/EmailSettingsPanel';
import EmailGeneratorModal from '../shared/components/EmailGeneratorModal';

// Helper to extract email from affiliation string (fallback when email field is null)
function extractEmailFromAffiliation(affiliation) {
  if (!affiliation) return null;
  // Match common email patterns in affiliation strings
  const emailMatch = affiliation.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return emailMatch ? emailMatch[0] : null;
}

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

// Build Google Scholar author search URL
function buildScholarSearchUrl(name, affiliation) {
  // Safety check - return empty search if no name
  if (!name) {
    return 'https://scholar.google.com/citations?view_op=search_authors&mauthors=';
  }

  // Clean up name - remove titles like Dr., Prof., Professor
  const cleanName = name
    .replace(/^(Dr\.?|Prof\.?|Professor)\s+/i, '')
    .trim();

  // Extract just the institution name from full affiliation
  // Affiliations often look like: "Department of Biology, University of Minnesota, Minneapolis, MN 55455, USA"
  // We want just: "University of Minnesota"
  let cleanAffiliation = '';
  if (affiliation) {
    // Remove email addresses first
    const affWithoutEmail = affiliation.replace(/\S+@\S+/g, '').trim();

    // Split by comma and look for actual institution names (university/institute/college)
    // Prioritize actual institutions over departments/schools
    const parts = affWithoutEmail.split(',').map(p => p.trim()).filter(p => p.length > 0);

    // First, look for "University" or "Institute" (actual institutions)
    let institutionPart = parts.find(p =>
      /\buniversity\b|\binstitute\b|\bcollege\b/i.test(p) &&
      !/^(department|dept|division|school|faculty|center|centre)\s+of/i.test(p)
    );

    // If not found, try "School of Medicine", "Medical School", etc. (standalone schools)
    if (!institutionPart) {
      institutionPart = parts.find(p =>
        /\bschool\b|\blaboratory\b|\blab\b/i.test(p)
      );
    }

    cleanAffiliation = institutionPart || parts[0] || '';

    // Remove department prefixes if they slipped through
    cleanAffiliation = cleanAffiliation
      .replace(/^(department of|dept\.? of|division of|school of|faculty of|center for|centre for)\s+/i, '')
      .trim();
  }

  // Use the author profile search which finds researcher pages
  const query = cleanAffiliation
    ? `${cleanName} ${cleanAffiliation}`
    : cleanName;
  return `https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(query)}`;
}

// Candidate card component
function CandidateCard({ candidate, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);  // For "View papers" toggle

  const isClaudeSuggestion = candidate.isClaudeSuggestion || candidate.source === 'claude_suggestion';
  const reasoning = candidate.reasoning || candidate.generatedReasoning || 'No reasoning available';

  // Check verification confidence - categorize into ranges
  const confidence = candidate.verificationConfidence;
  const isLowConfidence = confidence !== undefined && confidence < 0.35;
  const isWeakMatch = confidence !== undefined && confidence >= 0.35 && confidence < 0.65;

  // Check for mismatches (wrong person or wrong expertise)
  const hasInstitutionMismatch = candidate.institutionMismatch;
  const hasExpertiseMismatch = candidate.expertiseMismatch;
  const hasAnyMismatch = hasInstitutionMismatch || hasExpertiseMismatch;

  const hasCoauthorCOI = candidate.hasCoauthorCOI;
  const hasInstitutionCOI = candidate.hasInstitutionCOI;
  const hasAnyCOI = hasCoauthorCOI || hasInstitutionCOI;

  return (
    <div className={`
      border rounded-lg p-4 transition-all duration-200
      ${selected ? 'border-blue-500 bg-blue-50' :
        hasAnyCOI ? 'border-red-300 bg-red-50' :
        hasAnyMismatch ? 'border-orange-300 bg-orange-50' :
        isLowConfidence ? 'border-amber-300 bg-amber-50' :
        isWeakMatch ? 'border-yellow-200 bg-yellow-50' :
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

          {/* Low confidence warning (< 35%) */}
          {isLowConfidence && (
            <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
              <span className="font-medium">⚠️ Low match ({Math.round(confidence * 100)}%):</span> Publications don't match Claude's description.
              This could be a different person with the same name.
            </div>
          )}

          {/* Weak match warning (35-65%) */}
          {isWeakMatch && !hasAnyMismatch && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-xs text-yellow-800">
              <span className="font-medium">⚡ Weak match ({Math.round(confidence * 100)}%):</span> Some publications match, but relevance is uncertain. Verify expertise manually.
            </div>
          )}

          {/* Institution mismatch warning - may have verified wrong person */}
          {hasInstitutionMismatch && candidate.suggestedInstitution && (
            <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-xs text-orange-800">
              <span className="font-medium">⚠️ Institution mismatch:</span> Claude suggested <strong>{candidate.suggestedInstitution}</strong>,
              but PubMed shows <strong>{candidate.affiliation?.split(',')[0] || 'different institution'}</strong>.
              This may be a different person with the same name.
            </div>
          )}

          {/* Expertise mismatch warning - Claude may have fabricated expertise */}
          {hasExpertiseMismatch && candidate.expertiseAreas && (
            <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-xs text-orange-800">
              <span className="font-medium">⚠️ Expertise mismatch:</span> Claude claimed expertise in "{candidate.expertiseAreas.slice(0, 2).join(', ')}"
              but no publications found with these specific terms. Actual research focus may differ.
            </div>
          )}

          <div className="mt-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Why: </span>
              {reasoning}
            </p>
          </div>

          <div className="mt-2 flex items-center flex-wrap gap-2 text-xs text-gray-500">
            {candidate.verified !== false && (
              <span className="flex items-center gap-1">
                <span className={
                  hasAnyMismatch ? 'text-orange-500' :
                  isLowConfidence ? 'text-amber-500' :
                  isWeakMatch ? 'text-yellow-600' :
                  'text-green-500'
                }>
                  {hasAnyMismatch ? '⚠' : isLowConfidence ? '⚠' : isWeakMatch ? '⚡' : '✓'}
                </span>
                {candidate.publicationCount5yr || candidate.publications?.length || 0} publications
                {confidence !== undefined && (
                  <span className={
                    hasAnyMismatch ? 'text-orange-500' :
                    isLowConfidence ? 'text-amber-500' :
                    isWeakMatch ? 'text-yellow-600' :
                    'text-gray-400'
                  }>
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

          {/* Contact info (if enriched) */}
          {candidate.contactEnrichment && (candidate.contactEnrichment.email || candidate.contactEnrichment.website || candidate.contactEnrichment.orcidUrl) && (
            <div className="mt-2 flex items-center flex-wrap gap-2 text-xs">
              {candidate.contactEnrichment.email && (
                <a
                  href={`mailto:${candidate.contactEnrichment.email}`}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                  title={`Email (from ${candidate.contactEnrichment.emailSource || 'enrichment'}${candidate.contactEnrichment.emailYear ? `, ${candidate.contactEnrichment.emailYear}` : ''})`}
                >
                  📧 {candidate.contactEnrichment.email}
                </a>
              )}
              {candidate.contactEnrichment.website && (
                <a
                  href={candidate.contactEnrichment.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                  title="Faculty/Personal website"
                >
                  🔗 Website
                </a>
              )}
              {candidate.contactEnrichment.orcidUrl && (
                <a
                  href={candidate.contactEnrichment.orcidUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"
                  title="ORCID Profile"
                >
                  ORCID
                </a>
              )}
            </div>
          )}

          {/* Action buttons: View papers + Scholar lookup */}
          <div className="mt-2 flex items-center gap-3">
            {candidate.publications && candidate.publications.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {expanded ? 'Show less' : `View ${candidate.publications.length} papers`}
              </button>
            )}
            <a
              href={buildScholarSearchUrl(candidate.name, candidate.affiliation)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
              title="Search Google Scholar for this researcher's profile, h-index, and citations"
            >
              🎓 Scholar Profile
            </a>
          </div>

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
function NewSearchTab({ apiKey, apiSettings, onCandidatesSaved, searchState, setSearchState }) {
  // Use lifted state from parent (persists across tab switches)
  const { uploadedFiles, analysisResult, discoveryResult, selectedCandidates } = searchState;

  // Helper to update lifted state (support both direct values and callback functions)
  const setUploadedFiles = (filesOrFn) => setSearchState(prev => ({
    ...prev,
    uploadedFiles: typeof filesOrFn === 'function' ? filesOrFn(prev.uploadedFiles) : filesOrFn
  }));
  const setAnalysisResult = (resultOrFn) => setSearchState(prev => ({
    ...prev,
    analysisResult: typeof resultOrFn === 'function' ? resultOrFn(prev.analysisResult) : resultOrFn
  }));
  const setDiscoveryResult = (resultOrFn) => setSearchState(prev => ({
    ...prev,
    discoveryResult: typeof resultOrFn === 'function' ? resultOrFn(prev.discoveryResult) : resultOrFn
  }));
  const setSelectedCandidates = (candidatesOrFn) => setSearchState(prev => ({
    ...prev,
    selectedCandidates: typeof candidatesOrFn === 'function' ? candidatesOrFn(prev.selectedCandidates) : candidatesOrFn
  }));

  // Local state (OK to reset on tab switch)
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [excludedNames, setExcludedNames] = useState('');
  const [temperature, setTemperature] = useState(0.3); // Default: conservative, predictable
  const [reviewerCount, setReviewerCount] = useState(12); // Default: 12 candidates
  const [searchSources, setSearchSources] = useState({
    pubmed: true,
    arxiv: true,
    biorxiv: true
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStage, setCurrentStage] = useState(null);
  const [progressMessages, setProgressMessages] = useState([]);
  const [error, setError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);

  // Contact enrichment state
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(null);
  const [enrichmentResults, setEnrichmentResults] = useState(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [enrichmentOptions, setEnrichmentOptions] = useState({
    usePubmed: true,
    useOrcid: true,
    useClaudeSearch: false,
    useSerpSearch: false,
  });

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

  const addProgressMessage = (message, type = 'info') => {
    setProgressMessages(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
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
          excludedNames: excludedNames.split(',').map(n => n.trim()).filter(Boolean),
          temperature,
          reviewerCount
        })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let analysisData = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.slice(7);
            // Next line should be data
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                // Detect fallback status from message or status field
                const isFallback = data.status === 'fallback' || data.message?.toLowerCase().includes('fallback');
                addProgressMessage(data.message, isFallback ? 'fallback' : 'info');
              }
              if (data.proposalInfo) {
                analysisData = data;
              }
              if (data.error) {
                throw new Error(data.error || data.message);
              }
            } catch (e) {
              // Silently ignore parse errors - likely incomplete chunks
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
      let discoverBuffer = '';

      while (true) {
        const { done, value } = await discoverReader.read();
        if (done) break;

        discoverBuffer += decoder.decode(value, { stream: true });
        const lines = discoverBuffer.split('\n');
        discoverBuffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message) {
                // Detect fallback status from message or status field
                const isFallback = data.status === 'fallback' || data.message?.toLowerCase().includes('fallback');
                addProgressMessage(data.message, isFallback ? 'fallback' : 'info');
              }
              if (data.ranked) {
                discoveryData = data;
              }
              if (data.error) {
                throw new Error(data.error || data.message);
              }
            } catch (e) {
              // Silently ignore parse errors - likely incomplete chunks
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

  // Apply enrichment results to candidates in discoveryResult
  const applyEnrichmentResults = (enrichmentData) => {
    if (!enrichmentData?.results || !discoveryResult) return;

    // Create a map of enriched candidates by name for quick lookup
    const enrichedMap = new Map();
    enrichmentData.results.forEach(result => {
      enrichedMap.set(result.name, result.contactEnrichment);
    });

    // Update the discoveryResult with enriched contact info
    const updateCandidate = (candidate) => {
      const enrichment = enrichedMap.get(candidate.name);
      if (enrichment) {
        return { ...candidate, contactEnrichment: enrichment };
      }
      return candidate;
    };

    setDiscoveryResult(prev => ({
      ...prev,
      ranked: prev.ranked?.map(updateCandidate) || [],
      verified: prev.verified?.map(updateCandidate) || [],
      discovered: prev.discovered?.map(updateCandidate) || [],
    }));
  };

  // Get selected candidate objects
  const getSelectedCandidateObjects = () => {
    return allCandidates.filter(c => selectedCandidates.has(c.name));
  };

  // Generate a consistent proposal ID from the title (no timestamp for deduplication)
  const generateProposalId = () => {
    const title = analysisResult?.proposalInfo?.title || 'untitled';
    // Create a deterministic slug from title - same title = same ID
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    return slug;
  };

  // Save candidates to database
  // Optional enrichmentData parameter allows saving with freshly enriched contact info
  const handleSaveCandidates = async (enrichmentData = null) => {
    let selected = getSelectedCandidateObjects();
    if (selected.length === 0) return;

    // If enrichment data is provided, merge it into candidates before saving
    if (enrichmentData?.results) {
      const enrichedMap = new Map();
      enrichmentData.results.forEach(result => {
        enrichedMap.set(result.name, result.contactEnrichment);
      });

      selected = selected.map(candidate => {
        const enrichment = enrichedMap.get(candidate.name);
        if (enrichment) {
          return {
            ...candidate,
            contactEnrichment: enrichment,
            // Also set top-level email/website for database storage
            email: enrichment.email || candidate.email,
            website: enrichment.website || candidate.website
          };
        }
        return candidate;
      });
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/reviewer-finder/save-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: generateProposalId(),
          proposalTitle: analysisResult?.proposalInfo?.title || 'Untitled Proposal',
          proposalAbstract: analysisResult?.proposalInfo?.abstract || '',
          proposalAuthors: analysisResult?.proposalInfo?.proposalAuthors || '',
          proposalInstitution: analysisResult?.proposalInfo?.authorInstitution || '',
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

  // Enrich selected candidates with contact information
  const handleEnrichContacts = async () => {
    const selected = getSelectedCandidateObjects();
    if (selected.length === 0) return;

    setIsEnriching(true);
    setEnrichmentProgress(null);
    setEnrichmentResults(null);
    setShowEnrichmentModal(true);

    try {
      const response = await fetch('/api/reviewer-finder/enrich-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: selected,
          credentials: {
            orcidClientId: apiSettings?.orcidClientId,
            orcidClientSecret: apiSettings?.orcidClientSecret,
            claudeApiKey: enrichmentOptions.useClaudeSearch ? apiKey : null,
            serpApiKey: enrichmentOptions.useSerpSearch ? apiSettings?.serpApiKey : null,
          },
          options: enrichmentOptions,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'estimate') {
                setEnrichmentProgress({ type: 'estimate', ...data.estimate });
              } else if (data.type === 'progress') {
                setEnrichmentProgress(prev => ({ ...prev, ...data }));
              } else if (data.type === 'complete') {
                setEnrichmentResults(data);
                setEnrichmentProgress({ type: 'complete' });
              } else if (data.type === 'error') {
                setEnrichmentProgress({ type: 'error', message: data.message });
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (err) {
      setEnrichmentProgress({ type: 'error', message: err.message });
    } finally {
      setIsEnriching(false);
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

      // Contact information (from enrichment)
      if (candidate.contactEnrichment) {
        const ce = candidate.contactEnrichment;
        if (ce.email || ce.website || ce.orcidUrl) {
          markdown += `**Contact:**\n`;
          if (ce.email) {
            markdown += `- Email: [${ce.email}](mailto:${ce.email})`;
            if (ce.emailSource) markdown += ` _(from ${ce.emailSource}${ce.emailYear ? `, ${ce.emailYear}` : ''})_`;
            markdown += '\n';
          }
          if (ce.website) {
            markdown += `- Website: [${ce.website}](${ce.website})\n`;
          }
          if (ce.facultyPageUrl && ce.facultyPageUrl !== ce.website) {
            markdown += `- Faculty Page: [${ce.facultyPageUrl}](${ce.facultyPageUrl})\n`;
          }
          if (ce.orcidUrl) {
            markdown += `- ORCID: [${ce.orcidId || 'Profile'}](${ce.orcidUrl})\n`;
          }
          markdown += '\n';
        }
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

    // CSV header - now includes contact info columns
    let csv = 'Name,Affiliation,Email,Email_Source,Website,ORCID,Source,Seniority,Publications_5yr,COI_Warning,Reasoning\n';

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

      // Contact enrichment fields
      const ce = candidate.contactEnrichment || {};
      const email = ce.email || '';
      const emailSource = ce.emailSource ? `${ce.emailSource}${ce.emailYear ? ` (${ce.emailYear})` : ''}` : '';
      const website = ce.website || ce.facultyPageUrl || '';
      const orcid = ce.orcidUrl || '';

      csv += `"${candidate.name}","${candidate.affiliation || ''}","${email}","${emailSource}","${website}","${orcid}","${source}","${candidate.seniorityEstimate || ''}",${pubCount},"${coiWarning}","${reasoning}"\n`;
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Candidates: {reviewerCount}
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-8">1</span>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={reviewerCount}
                onChange={(e) => setReviewerCount(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs text-gray-500 w-8 text-right">25</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reviewer Diversity: {temperature.toFixed(1)}
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-20">Conservative</span>
              <input
                type="range"
                min="0.3"
                max="1.0"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-xs text-gray-500 w-16 text-right">Creative</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {temperature <= 0.4 ? 'More predictable, established reviewers' :
               temperature <= 0.6 ? 'Balanced mix of established and diverse candidates' :
               temperature <= 0.8 ? 'More diverse, potentially unconventional suggestions' :
               'Maximum creativity, broader range of candidates'}
            </p>
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
              <div key={i} className={`${msg.type === 'fallback' ? 'text-amber-600 bg-amber-50 px-1 rounded' : 'text-gray-600'}`}>
                <span className="text-gray-400">[{msg.time}]</span>{' '}
                {msg.type === 'fallback' && <span className="font-medium">⚠️ </span>}
                {msg.message}
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
                <Button
                  variant="secondary"
                  onClick={() => setShowEnrichmentModal(true)}
                  disabled={isEnriching}
                >
                  📧 Find Contact Info ({selectedCandidates.size})
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

      {/* Contact Enrichment Modal */}
      {showEnrichmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  📧 Find Contact Information
                </h3>
                <button
                  onClick={() => setShowEnrichmentModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Pre-enrichment: Options */}
              {!isEnriching && !enrichmentResults && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600">
                    Find email addresses and websites for {selectedCandidates.size} selected candidate(s)
                    using our tiered lookup system.
                  </p>

                  {/* Tier options */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Search Methods:</h4>

                    <label className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrichmentOptions.usePubmed}
                        onChange={(e) => setEnrichmentOptions(prev => ({ ...prev, usePubmed: e.target.checked }))}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-green-800">Tier 1: PubMed</div>
                        <div className="text-xs text-green-600">
                          Extract emails from recent publication affiliations. <strong>Free</strong>
                        </div>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-3 rounded-lg ${
                      apiSettings?.orcidClientId && apiSettings?.orcidClientSecret
                        ? 'bg-green-50 border border-green-200 cursor-pointer'
                        : 'bg-gray-50 border border-gray-200 cursor-not-allowed opacity-60'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enrichmentOptions.useOrcid && apiSettings?.orcidClientId && apiSettings?.orcidClientSecret}
                        onChange={(e) => setEnrichmentOptions(prev => ({ ...prev, useOrcid: e.target.checked }))}
                        className="mt-0.5"
                        disabled={!apiSettings?.orcidClientId || !apiSettings?.orcidClientSecret}
                      />
                      <div>
                        <div className={`font-medium ${apiSettings?.orcidClientId && apiSettings?.orcidClientSecret ? 'text-green-800' : 'text-gray-500'}`}>
                          Tier 2: ORCID
                        </div>
                        <div className={`text-xs ${apiSettings?.orcidClientId && apiSettings?.orcidClientSecret ? 'text-green-600' : 'text-gray-500'}`}>
                          Look up email, website, and ORCID ID. <strong>Free</strong>
                          {(!apiSettings?.orcidClientId || !apiSettings?.orcidClientSecret) && (
                            <span className="ml-1 text-amber-600">(Configure ORCID credentials in API Settings)</span>
                          )}
                        </div>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-3 rounded-lg ${
                      apiKey
                        ? 'bg-amber-50 border border-amber-200 cursor-pointer'
                        : 'bg-gray-50 border border-gray-200 cursor-not-allowed opacity-60'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enrichmentOptions.useClaudeSearch && !!apiKey}
                        onChange={(e) => setEnrichmentOptions(prev => ({ ...prev, useClaudeSearch: e.target.checked }))}
                        className="mt-0.5"
                        disabled={!apiKey}
                      />
                      <div>
                        <div className={`font-medium ${apiKey ? 'text-amber-800' : 'text-gray-500'}`}>
                          Tier 3: Claude Web Search
                        </div>
                        <div className={`text-xs ${apiKey ? 'text-amber-600' : 'text-gray-500'}`}>
                          Search faculty pages and directories with AI. <strong>~$0.015 per candidate</strong>
                          {!apiKey && (
                            <span className="ml-1 text-red-600">(Requires Claude API key)</span>
                          )}
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrichmentOptions.useSerpSearch}
                        onChange={(e) => setEnrichmentOptions(prev => ({ ...prev, useSerpSearch: e.target.checked }))}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-blue-800">
                          Tier 4: Google Search (SerpAPI)
                        </div>
                        <div className="text-xs text-blue-600">
                          Search Google for faculty pages and emails. <strong>~$0.005 per candidate</strong>
                          {!apiSettings?.serpApiKey && (
                            <span className="ml-1 text-amber-600">(Configure SerpAPI key in API Settings)</span>
                          )}
                          <div className="mt-1 text-blue-500">
                            Only runs if Tiers 1-3 don't find contact info.
                          </div>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Cost estimate */}
                  {(enrichmentOptions.useClaudeSearch || enrichmentOptions.useSerpSearch) && (
                    <div className="p-4 bg-gray-100 rounded-lg">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Estimated cost (worst case):</span>
                        <span className="font-medium text-gray-900">
                          ${(() => {
                            let cost = 0;
                            if (enrichmentOptions.useClaudeSearch) {
                              cost += selectedCandidates.size * 0.015;
                            }
                            if (enrichmentOptions.useSerpSearch) {
                              // If Claude search is enabled, only ~10% might need Tier 4
                              const multiplier = enrichmentOptions.useClaudeSearch ? 0.1 : 0.5;
                              cost += selectedCandidates.size * multiplier * 0.005;
                            }
                            return cost.toFixed(2);
                          })()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Paid tiers only run if free tiers don't find contact info. Actual cost is usually lower.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* During enrichment: Progress */}
              {isEnriching && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin text-2xl">⏳</div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {enrichmentProgress?.overall?.candidate || 'Starting enrichment...'}
                      </div>
                      <div className="text-sm text-gray-500">
                        Candidate {enrichmentProgress?.overall?.current || 1} of {enrichmentProgress?.overall?.total || selectedCandidates.size}
                      </div>
                    </div>
                  </div>

                  {/* Current tier status */}
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                      enrichmentProgress?.tier?.tier === 1 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      <span>{enrichmentProgress?.tier?.tier === 1 ? '🔄' : '⬜'}</span>
                      <span className="font-medium">Tier 1: PubMed</span>
                      {enrichmentProgress?.tier?.tier === 1 && (
                        <span className="ml-auto text-xs">{enrichmentProgress.tier.message}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                      enrichmentProgress?.tier?.tier === 2 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      <span>{enrichmentProgress?.tier?.tier === 2 ? '🔄' : '⬜'}</span>
                      <span className="font-medium">Tier 2: ORCID</span>
                      {enrichmentProgress?.tier?.tier === 2 && (
                        <span className="ml-auto text-xs">{enrichmentProgress.tier.message}</span>
                      )}
                    </div>
                    {enrichmentOptions.useClaudeSearch && (
                      <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                        enrichmentProgress?.tier?.tier === 3 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'
                      }`}>
                        <span>{enrichmentProgress?.tier?.tier === 3 ? '🔄' : '⬜'}</span>
                        <span className="font-medium">Tier 3: Web Search</span>
                        {enrichmentProgress?.tier?.tier === 3 && (
                          <span className="ml-auto text-xs">{enrichmentProgress.tier.message}</span>
                        )}
                      </div>
                    )}
                    {enrichmentOptions.useSerpSearch && (
                      <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                        enrichmentProgress?.tier?.tier === 4 ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'
                      }`}>
                        <span>{enrichmentProgress?.tier?.tier === 4 ? '🔄' : '⬜'}</span>
                        <span className="font-medium">Tier 4: Google Search</span>
                        {enrichmentProgress?.tier?.tier === 4 && (
                          <span className="ml-auto text-xs">{enrichmentProgress.tier.message}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${((enrichmentProgress?.overall?.current || 0) / (enrichmentProgress?.overall?.total || selectedCandidates.size)) * 100}%`
                      }}
                    />
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    Looking up contact information for each candidate...
                  </p>
                </div>
              )}

              {/* After enrichment: Results */}
              {enrichmentResults && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-green-600">
                    <span className="text-2xl">✓</span>
                    <span className="font-medium">Enrichment Complete</span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{enrichmentResults.stats?.withEmail || 0}</div>
                      <div className="text-xs text-gray-500">Emails Found</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{enrichmentResults.stats?.withWebsite || 0}</div>
                      <div className="text-xs text-gray-500">Websites Found</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">{enrichmentResults.stats?.withOrcid || 0}</div>
                      <div className="text-xs text-gray-500">ORCID IDs</div>
                    </div>
                  </div>

                  {/* Results list */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {enrichmentResults.results?.map((result, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <span className="font-medium truncate">{result.name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          {result.contactEnrichment?.email && (
                            <a href={`mailto:${result.contactEnrichment.email}`} className="text-blue-600 hover:underline">
                              📧 {result.contactEnrichment.email}
                            </a>
                          )}
                          {result.contactEnrichment?.website && (
                            <a href={result.contactEnrichment.website} target="_blank" rel="noopener noreferrer" className="text-blue-600">
                              🔗
                            </a>
                          )}
                          {result.contactEnrichment?.orcidUrl && (
                            <a href={result.contactEnrichment.orcidUrl} target="_blank" rel="noopener noreferrer" className="text-green-600">
                              ORCID
                            </a>
                          )}
                          {!result.contactEnrichment?.email && !result.contactEnrichment?.website && (
                            <span className="text-gray-400">No contact found</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {enrichmentResults.stats?.actualCost > 0 && (
                    <div className="text-sm text-gray-500 text-center">
                      Actual cost: ${enrichmentResults.stats.actualCost.toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              {/* Error state */}
              {enrichmentProgress?.type === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <div className="font-medium">Error</div>
                  <div className="text-sm">{enrichmentProgress.message}</div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              {!isEnriching && !enrichmentResults && (
                <>
                  <Button variant="outline" onClick={() => setShowEnrichmentModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleEnrichContacts}>
                    Start Enrichment
                  </Button>
                </>
              )}
              {enrichmentResults && (
                <Button variant="primary" onClick={async () => {
                  // Apply enrichment results to candidates display
                  applyEnrichmentResults(enrichmentResults);

                  // Save to My Candidates with enrichment data
                  await handleSaveCandidates(enrichmentResults);

                  setShowEnrichmentModal(false);
                  setEnrichmentResults(null);
                  setEnrichmentProgress(null);
                }}>
                  Save to My Candidates
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Saved Candidate Card (simpler than search results)
function SavedCandidateCard({ candidate, onUpdate, onRemove, isSelectedForDeletion, onToggleSelection }) {
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

  // Use email from database, or extract from affiliation as fallback
  const displayEmail = candidate.email || extractEmailFromAffiliation(candidate.affiliation);

  return (
    <div className={`border rounded-lg p-4 ${
      isSelectedForDeletion ? 'border-red-400 bg-red-50' :
      hasAnyCOI ? 'border-red-200 bg-red-50' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <input
          type="checkbox"
          checked={isSelectedForDeletion}
          onChange={onToggleSelection}
          className="mt-1 h-4 w-4 text-red-600 rounded border-gray-300 flex-shrink-0"
          title="Select for deletion"
        />
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
          {(displayEmail || candidate.website) && (
            <div className="flex items-center gap-3 mt-1">
              {displayEmail && (
                <a
                  href={`mailto:${displayEmail}`}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  title={displayEmail}
                >
                  ✉️ {displayEmail}
                </a>
              )}
              {candidate.website && (
                <a
                  href={candidate.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  title={candidate.website}
                >
                  🔗 Website
                </a>
              )}
            </div>
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

      {/* Action buttons: Show details + Scholar lookup */}
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
        <a
          href={buildScholarSearchUrl(candidate.name, candidate.affiliation)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
          title="Search Google Scholar for this researcher's profile, h-index, and citations"
        >
          🎓 Scholar Profile
        </a>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {candidate.reasoning && (
            <div>
              <p className="text-xs font-medium text-gray-600">Why this reviewer:</p>
              <p className="text-sm text-gray-700">{candidate.reasoning}</p>
            </div>
          )}

          {displayEmail && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">Email:</span>{' '}
              <a href={`mailto:${displayEmail}`} className="text-blue-600">{displayEmail}</a>
              {!candidate.email && <span className="text-gray-400 ml-1">(from affiliation)</span>}
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
function MyCandidatesTab({ refreshTrigger, claudeApiKey }) {
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalData, setEmailModalData] = useState({ candidates: [], proposalInfo: {} });

  const fetchCandidates = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedForDeletion(new Set());
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

  const handleToggleSelection = (suggestionId) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  };

  const handleSelectAllInProposal = (proposal) => {
    const allIds = proposal.candidates.map(c => c.suggestionId);
    const allSelected = allIds.every(id => selectedForDeletion.has(id));

    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedForDeletion.size === 0) return;
    if (!confirm(`Remove ${selectedForDeletion.size} candidate(s) from your list?`)) return;

    setIsDeleting(true);
    try {
      // Delete all selected candidates
      await Promise.all(
        Array.from(selectedForDeletion).map(suggestionId =>
          fetch('/api/reviewer-finder/my-candidates', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suggestionId })
          })
        )
      );
      fetchCandidates();
    } catch (err) {
      console.error('Bulk delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Get selected candidate objects with their proposal info for email generation
  const getSelectedCandidatesWithProposalInfo = () => {
    const selectedCandidates = [];
    let proposalInfo = {};

    for (const proposal of proposals) {
      const candidatesFromProposal = proposal.candidates.filter(c =>
        selectedForDeletion.has(c.suggestionId)
      );

      if (candidatesFromProposal.length > 0) {
        // Use first proposal's info if we have multiple
        if (!proposalInfo.title) {
          proposalInfo = {
            title: proposal.proposalTitle,
            abstract: proposal.proposalAbstract || '',
            authors: proposal.proposalAuthors || '',
            institution: proposal.proposalInstitution || ''
          };
        }

        selectedCandidates.push(...candidatesFromProposal.map(c => ({
          name: c.name,
          email: c.email || extractEmailFromAffiliation(c.affiliation),
          affiliation: c.affiliation,
          expertise: c.expertiseAreas || [],
          reasoning: c.reasoning
        })));
      }
    }

    return { selectedCandidates, proposalInfo };
  };

  // Open email modal with selected candidates
  const handleOpenEmailModal = () => {
    const { selectedCandidates, proposalInfo } = getSelectedCandidatesWithProposalInfo();
    if (selectedCandidates.length === 0) return;

    setEmailModalData({
      candidates: selectedCandidates,
      proposalInfo
    });
    setShowEmailModal(true);
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
          <div className="flex items-center gap-4 text-sm">
            <span className="text-blue-600">{invitedCount} invited</span>
            <span className="text-green-600">{acceptedCount} accepted</span>
            {selectedForDeletion.size > 0 && (
              <>
                <button
                  onClick={handleOpenEmailModal}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  ✉️ Email Selected ({selectedForDeletion.size})
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : `Delete Selected (${selectedForDeletion.size})`}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Email Settings (collapsible) */}
      <EmailSettingsPanel />

      {/* Proposals with Candidates */}
      {proposals.map((proposal) => {
        const allIds = proposal.candidates.map(c => c.suggestionId);
        const allSelected = allIds.length > 0 && allIds.every(id => selectedForDeletion.has(id));
        const someSelected = allIds.some(id => selectedForDeletion.has(id));

        return (
          <Card key={proposal.proposalId}>
            <div className="flex items-center gap-3 mb-1">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() => handleSelectAllInProposal(proposal)}
                className="h-4 w-4 text-red-600 rounded border-gray-300"
                title="Select all candidates in this proposal"
              />
              <h4 className="font-medium text-gray-900">
                {proposal.proposalTitle}
              </h4>
            </div>
            <p className="text-xs text-gray-400 mb-4 ml-7">
              {proposal.candidates.length} candidate(s)
            </p>

            <div className="space-y-3">
              {proposal.candidates.map((candidate) => (
                <SavedCandidateCard
                  key={candidate.suggestionId}
                  candidate={candidate}
                  onUpdate={handleUpdateCandidate}
                  onRemove={handleRemoveCandidate}
                  isSelectedForDeletion={selectedForDeletion.has(candidate.suggestionId)}
                  onToggleSelection={() => handleToggleSelection(candidate.suggestionId)}
                />
              ))}
            </div>
          </Card>
        );
      })}

      {/* Email Generator Modal */}
      {showEmailModal && (
        <EmailGeneratorModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          candidates={emailModalData.candidates}
          proposalInfo={emailModalData.proposalInfo}
          claudeApiKey={claudeApiKey}
        />
      )}
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
  const [apiSettings, setApiSettings] = useState({
    orcidClientId: '',
    orcidClientSecret: '',
    ncbiApiKey: '',
  });

  // Lifted state from NewSearchTab to persist across tab switches
  const [searchState, setSearchState] = useState({
    uploadedFiles: [],
    analysisResult: null,
    discoveryResult: null,
    selectedCandidates: new Set(),
  });

  // Load API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('claudeApiKey');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Handle API settings change from ApiSettingsPanel
  const handleApiSettingsChange = (settings) => {
    setApiSettings(settings);
  };

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
          <div className="flex items-center gap-4 mb-4">
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

          {/* Optional API Settings (ORCID, NCBI) */}
          <ApiSettingsPanel onSettingsChange={handleApiSettingsChange} />
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
          {activeTab === 'search' && <NewSearchTab apiKey={apiKey} apiSettings={apiSettings} onCandidatesSaved={handleCandidatesSaved} searchState={searchState} setSearchState={setSearchState} />}
          {activeTab === 'candidates' && <MyCandidatesTab refreshTrigger={myCandidatesRefresh} claudeApiKey={apiKey} />}
          {activeTab === 'database' && <DatabaseTab />}
        </div>
      </div>
    </Layout>
  );
}
