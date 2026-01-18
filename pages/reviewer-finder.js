/**
 * Expert Reviewer Finder v2
 *
 * A tiered, progressive reviewer discovery system that combines:
 * - Claude's analytical reasoning (the "why")
 * - Real database verification (the "who")
 *
 * Three-tab interface:
 * - Tab 1: New Search - Upload proposal and find reviewers
 * - Tab 2: My Candidates - Saved/selected candidates with email generation
 * - Tab 3: Database - Browse/search all researchers with filtering & pagination
 */

import { useState, useEffect, useRef } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiSettingsPanel from '../shared/components/ApiSettingsPanel';
import EmailSettingsPanel from '../shared/components/EmailSettingsPanel';
import EmailGeneratorModal from '../shared/components/EmailGeneratorModal';
import SettingsModal from '../shared/components/SettingsModal';
import { getModelDisplayName } from '../shared/utils/modelNames';
import { BASE_CONFIG } from '../shared/config/baseConfig';

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
    biorxiv: true,
    chemrxiv: true
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

  // Current cycle state
  const [currentCycleInfo, setCurrentCycleInfo] = useState(null);
  const [availableCycles, setAvailableCycles] = useState([]);

  // Generate cycle options for current year and next year (18 months coverage)
  const generateCycleOptions = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;
    const yy = (currentYear % 100).toString();
    const yyNext = (nextYear % 100).toString();

    return [
      { shortCode: `J${yy}`, name: `June ${currentYear}` },
      { shortCode: `D${yy}`, name: `December ${currentYear}` },
      { shortCode: `J${yyNext}`, name: `June ${nextYear}` },
      { shortCode: `D${yyNext}`, name: `December ${nextYear}` },
    ];
  };

  // Load cycles and ensure current+next year cycles exist
  useEffect(() => {
    const loadAndEnsureCycles = async () => {
      try {
        const response = await fetch('/api/reviewer-finder/grant-cycles');
        if (!response.ok) return;

        const data = await response.json();
        const existingCycles = data.cycles || [];
        const neededCycles = generateCycleOptions();

        // Find which cycles need to be created
        const cyclesToCreate = neededCycles.filter(
          needed => !existingCycles.some(existing => existing.shortCode === needed.shortCode)
        );

        // Create missing cycles
        for (const cycle of cyclesToCreate) {
          await fetch('/api/reviewer-finder/grant-cycles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: cycle.name,
              shortCode: cycle.shortCode,
              programName: 'W. M. Keck Foundation',
            }),
          });
        }

        // Re-fetch to get all cycles with IDs
        const refreshResponse = await fetch('/api/reviewer-finder/grant-cycles');
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          const allCycles = refreshData.cycles || [];

          // Filter to only show current+next year cycles in dropdown
          const relevantShortCodes = neededCycles.map(c => c.shortCode);
          const relevantCycles = allCycles.filter(c =>
            relevantShortCodes.includes(c.shortCode) && c.isActive
          );

          // Sort: current year first, then by J before D
          relevantCycles.sort((a, b) => {
            const aYear = parseInt(a.shortCode.slice(1), 10);
            const bYear = parseInt(b.shortCode.slice(1), 10);
            if (aYear !== bYear) return aYear - bYear;
            return a.shortCode[0] === 'J' ? -1 : 1;
          });

          setAvailableCycles(relevantCycles);

          // Set current cycle from localStorage or default to first option
          const storedCycleId = localStorage.getItem(CURRENT_CYCLE_KEY);
          if (storedCycleId) {
            const storedCycle = allCycles.find(c => c.id === parseInt(storedCycleId, 10));
            if (storedCycle) {
              setCurrentCycleInfo(storedCycle);
            } else if (relevantCycles.length > 0) {
              setCurrentCycleInfo(relevantCycles[0]);
              localStorage.setItem(CURRENT_CYCLE_KEY, relevantCycles[0].id.toString());
            }
          } else if (relevantCycles.length > 0) {
            setCurrentCycleInfo(relevantCycles[0]);
            localStorage.setItem(CURRENT_CYCLE_KEY, relevantCycles[0].id.toString());
          }
        }
      } catch (err) {
        console.error('Failed to load/create cycles:', err);
      }
    };
    loadAndEnsureCycles();
  }, []);

  // Handle cycle selection change
  const handleCycleChange = (cycleId) => {
    const cycle = availableCycles.find(c => c.id === parseInt(cycleId, 10));
    if (cycle) {
      setCurrentCycleInfo(cycle);
      localStorage.setItem(CURRENT_CYCLE_KEY, cycle.id.toString());
    }
  };

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

      // Get summary pages setting from localStorage (for PDF extraction)
      let summaryPages = '2'; // Default to page 2
      try {
        const grantCycleStored = localStorage.getItem('email_grant_cycle');
        if (grantCycleStored) {
          const grantCycle = JSON.parse(atob(grantCycleStored));
          if (grantCycle.summaryPages) {
            summaryPages = grantCycle.summaryPages;
          }
        }
      } catch (e) {
        console.warn('Could not read summary pages setting:', e);
      }

      const response = await fetch('/api/reviewer-finder/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          blobUrl: uploadedFiles[0].url,
          additionalNotes,
          excludedNames: excludedNames.split(',').map(n => n.trim()).filter(Boolean),
          temperature,
          reviewerCount,
          summaryPages
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
            searchChemrxiv: searchSources.chemrxiv,
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
          programArea: analysisResult?.proposalInfo?.programArea || null,
          summaryBlobUrl: analysisResult?.summaryBlobUrl || null,
          grantCycleId: currentCycleInfo?.id || null,
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Upload Proposal</h3>
          {/* Grant Cycle Selector */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Grant Cycle:</span>
            <select
              value={currentCycleInfo?.id || ''}
              onChange={(e) => handleCycleChange(e.target.value)}
              className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded font-medium border-0 cursor-pointer appearance-none pr-8"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%237c3aed\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")',
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1rem'
              }}
            >
              {availableCycles.map(cycle => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.shortCode} - {cycle.name}
                </option>
              ))}
            </select>
          </div>
        </div>

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
            <div className="flex gap-3 flex-wrap">
              {[
                { key: 'pubmed', label: 'PubMed', icon: '📚', desc: 'Biomedical literature' },
                { key: 'arxiv', label: 'ArXiv', icon: '📄', desc: 'Physics, math, CS' },
                { key: 'biorxiv', label: 'BioRxiv', icon: '🧬', desc: 'Life sciences' },
                { key: 'chemrxiv', label: 'ChemRxiv', icon: '🧪', desc: 'Chemistry' },
              ].map(({ key, label, icon, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSearchSources(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`px-3 py-2 rounded-lg border transition-all flex flex-col items-center min-w-[90px] ${
                    searchSources[key]
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="font-medium text-sm">{label}</span>
                  <span className="text-xs opacity-75">{desc}</span>
                </button>
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
                  onClick={() => setShowEnrichmentModal(true)}
                  disabled={isEnriching}
                >
                  📧 Find Contacts & Save ({selectedCandidates.size})
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
                  📧 Find Contacts & Save
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

// Edit Candidate Modal
function EditCandidateModal({ isOpen, candidate, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    affiliation: '',
    email: '',
    website: '',
    hIndex: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when candidate changes
  useEffect(() => {
    if (candidate) {
      setFormData({
        name: candidate.name || '',
        affiliation: candidate.affiliation || '',
        email: candidate.email || '',
        website: candidate.website || '',
        hIndex: candidate.hIndex || ''
      });
      setError(null);
    }
  }, [candidate]);

  if (!isOpen || !candidate) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      // Build update payload with only changed fields
      const updates = {};
      if (formData.name !== candidate.name) updates.name = formData.name;
      if (formData.affiliation !== candidate.affiliation) updates.affiliation = formData.affiliation;
      if (formData.email !== (candidate.email || '')) updates.email = formData.email;
      if (formData.website !== (candidate.website || '')) updates.website = formData.website;
      if (formData.hIndex !== (candidate.hIndex || '')) {
        updates.hIndex = formData.hIndex ? parseInt(formData.hIndex, 10) : null;
      }

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      const response = await fetch('/api/reviewer-finder/my-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionId: candidate.suggestionId,
          ...updates
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update candidate');
      }

      // Call parent callback with updated data
      await onSave(candidate.suggestionId, updates);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Edit Candidate</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Affiliation</label>
            <input
              type="text"
              value={formData.affiliation}
              onChange={(e) => setFormData({ ...formData, affiliation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="researcher@university.edu"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">h-index</label>
            <input
              type="number"
              value={formData.hIndex}
              onChange={(e) => setFormData({ ...formData, hIndex: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              min="0"
              placeholder="e.g., 25"
            />
          </div>

          <p className="text-xs text-gray-500">
            Changes apply to all proposals containing this researcher.
          </p>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Researcher Detail Modal (for Database Tab) - with Edit and Delete support
function ResearcherDetailModal({ researcherId, onClose, onUpdate, onDelete }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (!researcherId) return;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/reviewer-finder/researchers?id=${researcherId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch researcher details');
        }
        const result = await response.json();
        setData(result);
        // Initialize edit form with current values
        if (result.researcher) {
          setEditForm({
            name: result.researcher.name || '',
            affiliation: result.researcher.affiliation || '',
            department: result.researcher.department || '',
            email: result.researcher.email || '',
            website: result.researcher.website || '',
            orcid: result.researcher.orcid || '',
            googleScholarId: result.researcher.googleScholarId || '',
            hIndex: result.researcher.hIndex || '',
            i10Index: result.researcher.i10Index || '',
            totalCitations: result.researcher.totalCitations || ''
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [researcherId]);

  // Handle escape key to close (but not when editing)
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isEditing && !showDeleteConfirm) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, isEditing, showDeleteConfirm]);

  if (!researcherId) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  // Group keywords by source
  const groupKeywordsBySource = (keywords) => {
    const groups = {};
    keywords.forEach(kw => {
      const source = kw.source || 'other';
      if (!groups[source]) groups[source] = [];
      groups[source].push(kw);
    });
    return groups;
  };

  const handleEditChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/reviewer-finder/researchers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: researcherId,
          name: editForm.name,
          affiliation: editForm.affiliation,
          department: editForm.department,
          email: editForm.email,
          website: editForm.website,
          orcid: editForm.orcid,
          googleScholarId: editForm.googleScholarId,
          hIndex: editForm.hIndex ? parseInt(editForm.hIndex) : null,
          i10Index: editForm.i10Index ? parseInt(editForm.i10Index) : null,
          totalCitations: editForm.totalCitations ? parseInt(editForm.totalCitations) : null
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save changes');
      }

      // Refresh data
      const refreshResponse = await fetch(`/api/reviewer-finder/researchers?id=${researcherId}`);
      const refreshedData = await refreshResponse.json();
      setData(refreshedData);
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/reviewer-finder/researchers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: researcherId })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete researcher');
      }

      if (onDelete) onDelete(researcherId);
      onClose();
    } catch (err) {
      setError(err.message);
      setShowDeleteConfirm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset form to original values
    if (data?.researcher) {
      setEditForm({
        name: data.researcher.name || '',
        affiliation: data.researcher.affiliation || '',
        department: data.researcher.department || '',
        email: data.researcher.email || '',
        website: data.researcher.website || '',
        orcid: data.researcher.orcid || '',
        googleScholarId: data.researcher.googleScholarId || '',
        hIndex: data.researcher.hIndex || '',
        i10Index: data.researcher.i10Index || '',
        totalCitations: data.researcher.totalCitations || ''
      });
    }
    setIsEditing(false);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEditing && !showDeleteConfirm) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex-1">
            {loading ? (
              <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            ) : isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => handleEditChange('name', e.target.value)}
                  className="text-lg font-semibold text-gray-900 border border-gray-300 rounded px-2 py-1 w-full"
                  placeholder="Name"
                />
                <input
                  type="text"
                  value={editForm.affiliation}
                  onChange={(e) => handleEditChange('affiliation', e.target.value)}
                  className="text-sm text-gray-600 border border-gray-300 rounded px-2 py-1 w-full"
                  placeholder="Affiliation"
                />
              </div>
            ) : data?.researcher ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">{data.researcher.name}</h2>
                {data.researcher.affiliation && (
                  <p className="text-sm text-gray-600">{data.researcher.affiliation}</p>
                )}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {!loading && data?.researcher && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit researcher"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                  title="Delete researcher"
                >
                  🗑️ Delete
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl ml-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="px-6 py-4 bg-red-50 border-b border-red-200">
            <p className="text-red-800 font-medium mb-2">
              Delete this researcher?
            </p>
            <p className="text-sm text-red-600 mb-3">
              This will permanently remove the researcher from the database.
              {data?.proposals?.length > 0 && (
                <span className="block mt-1">
                  Note: This researcher is associated with {data.proposals.length} proposal(s).
                  Those associations will be removed.
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isSaving ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading && (
            <div className="space-y-4">
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
            </div>
          )}

          {error && (
            <div className="text-red-600 bg-red-50 p-4 rounded-lg">
              {error}
            </div>
          )}

          {data?.researcher && (
            <>
              {/* Contact Information */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Contact Information
                </h3>
                {isEditing ? (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => handleEditChange('email', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="email@university.edu"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Website</label>
                      <input
                        type="url"
                        value={editForm.website}
                        onChange={(e) => handleEditChange('website', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">ORCID ID</label>
                      <input
                        type="text"
                        value={editForm.orcid}
                        onChange={(e) => handleEditChange('orcid', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="0000-0000-0000-0000"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Google Scholar ID</label>
                      <input
                        type="text"
                        value={editForm.googleScholarId}
                        onChange={(e) => handleEditChange('googleScholarId', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="Scholar user ID"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    {data.researcher.email ? (
                      <div className="flex items-start gap-2">
                        <span className="text-green-600">✉️</span>
                        <div>
                          <a href={`mailto:${data.researcher.email}`} className="text-blue-600 hover:underline">
                            {data.researcher.email}
                          </a>
                          {data.researcher.emailSource && (
                            <span className="text-xs text-gray-500 ml-2">
                              from {data.researcher.emailSource}
                              {data.researcher.emailYear && ` (${data.researcher.emailYear})`}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400">
                        <span>✉️</span>
                        <span>No email on file</span>
                      </div>
                    )}

                    {(data.researcher.website || data.researcher.facultyPageUrl) && (
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">🔗</span>
                        <a
                          href={data.researcher.website || data.researcher.facultyPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate"
                        >
                          {data.researcher.website || data.researcher.facultyPageUrl}
                        </a>
                      </div>
                    )}

                    {data.researcher.orcid && (
                      <div className="flex items-center gap-2">
                        <span className="text-green-700">🆔</span>
                        <a
                          href={data.researcher.orcidUrl || `https://orcid.org/${data.researcher.orcid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          ORCID: {data.researcher.orcid}
                        </a>
                      </div>
                    )}

                    {data.researcher.googleScholarUrl && (
                      <div className="flex items-center gap-2">
                        <span>🎓</span>
                        <a
                          href={data.researcher.googleScholarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Google Scholar Profile
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Metrics */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Metrics
                </h3>
                {isEditing ? (
                  <div className="bg-gray-50 rounded-lg p-4 flex gap-4">
                    <div>
                      <label className="text-xs text-gray-500">h-index</label>
                      <input
                        type="number"
                        value={editForm.hIndex}
                        onChange={(e) => handleEditChange('hIndex', e.target.value)}
                        className="w-24 border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">i10-index</label>
                      <input
                        type="number"
                        value={editForm.i10Index}
                        onChange={(e) => handleEditChange('i10Index', e.target.value)}
                        className="w-24 border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Citations</label>
                      <input
                        type="number"
                        value={editForm.totalCitations}
                        onChange={(e) => handleEditChange('totalCitations', e.target.value)}
                        className="w-28 border border-gray-300 rounded px-3 py-2 text-sm"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ) : (data.researcher.hIndex || data.researcher.i10Index || data.researcher.totalCitations) ? (
                  <div className="flex gap-4">
                    {data.researcher.hIndex && (
                      <div className="bg-purple-50 rounded-lg px-4 py-2 text-center">
                        <div className="text-2xl font-bold text-purple-700">{data.researcher.hIndex}</div>
                        <div className="text-xs text-purple-600">h-index</div>
                      </div>
                    )}
                    {data.researcher.i10Index && (
                      <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
                        <div className="text-2xl font-bold text-blue-700">{data.researcher.i10Index}</div>
                        <div className="text-xs text-blue-600">i10-index</div>
                      </div>
                    )}
                    {data.researcher.totalCitations && (
                      <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
                        <div className="text-2xl font-bold text-green-700">
                          {data.researcher.totalCitations.toLocaleString()}
                        </div>
                        <div className="text-xs text-green-600">Citations</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">No metrics available</p>
                )}
              </section>

              {/* Expertise Keywords (read-only) */}
              {data.keywords && data.keywords.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Expertise ({data.keywords.length} keywords)
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(groupKeywordsBySource(data.keywords)).map(([source, keywords]) => (
                      <div key={source}>
                        <div className="text-xs text-gray-500 mb-1 capitalize">
                          {source === 'claude' ? 'From Claude Analysis' :
                           source.startsWith('source:') ? source :
                           source === 'publications' ? 'From Publications' :
                           source}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {keywords.map((kw, i) => (
                            <span
                              key={i}
                              className={`
                                inline-flex items-center px-2 py-1 text-xs rounded
                                ${source === 'claude' ? 'bg-purple-100 text-purple-700' :
                                  kw.keyword.startsWith('source:') ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-700'}
                              `}
                              title={`Relevance: ${(kw.relevanceScore * 100).toFixed(0)}%`}
                            >
                              {kw.keyword.replace('source:', '')}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Proposal Associations (read-only) */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Proposal Associations ({data.proposals?.length || 0})
                </h3>
                {data.proposals && data.proposals.length > 0 ? (
                  <div className="space-y-3">
                    {data.proposals.map((proposal, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <div className="font-medium text-gray-900 text-sm">
                          {proposal.proposalTitle}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="text-gray-500">
                            Score: {(proposal.relevanceScore * 100).toFixed(0)}%
                          </span>
                          {proposal.selected && (
                            <span className="text-green-600">✓ Selected</span>
                          )}
                          {proposal.invited && (
                            <span className="text-blue-600">📧 Invited</span>
                          )}
                          {proposal.suggestedAt && (
                            <span className="text-gray-400">
                              {formatDate(proposal.suggestedAt)}
                            </span>
                          )}
                        </div>
                        {proposal.matchReason && (
                          <p className="text-xs text-gray-600 mt-2 italic">
                            "{proposal.matchReason.slice(0, 200)}{proposal.matchReason.length > 200 ? '...' : ''}"
                          </p>
                        )}
                        {proposal.notes && (
                          <p className="text-xs text-gray-700 mt-1 bg-yellow-50 p-2 rounded">
                            Note: {proposal.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">
                    Not associated with any proposals yet.
                  </p>
                )}
              </section>

              {/* Timestamps */}
              <section className="text-xs text-gray-400 pt-4 border-t">
                <div className="flex gap-4">
                  {data.researcher.createdAt && (
                    <span>Added: {formatDate(data.researcher.createdAt)}</span>
                  )}
                  {data.researcher.lastUpdated && (
                    <span>Updated: {formatDate(data.researcher.lastUpdated)}</span>
                  )}
                  {data.researcher.contactEnrichedAt && (
                    <span>Contacts enriched: {formatDate(data.researcher.contactEnrichedAt)}</span>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to format date for display
function formatShortDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Saved Candidate Card (simpler than search results)
function SavedCandidateCard({ candidate, onUpdate, onRemove, onEdit, isSelectedForDeletion, onToggleSelection }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(candidate.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const handleToggleInvited = async () => {
    const newInvited = !candidate.invited;
    // If marking as invited, set email_sent_at to now; if unmarking, clear it
    await onUpdate(candidate.suggestionId, {
      invited: newInvited,
      emailSentAt: newInvited ? 'now' : null
    });
  };

  const handleToggleAccepted = async () => {
    const newAccepted = !candidate.accepted;
    await onUpdate(candidate.suggestionId, {
      accepted: newAccepted,
      declined: false,
      responseType: newAccepted ? 'accepted' : null,
      responseReceivedAt: newAccepted ? 'now' : null
    });
  };

  const handleToggleDeclined = async () => {
    const newDeclined = !candidate.declined;
    await onUpdate(candidate.suggestionId, {
      declined: newDeclined,
      accepted: false,
      responseType: newDeclined ? 'declined' : null,
      responseReceivedAt: newDeclined ? 'now' : null
    });
  };

  const handleMarkBounced = async () => {
    await onUpdate(candidate.suggestionId, {
      responseType: 'bounced',
      responseReceivedAt: 'now'
    });
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status buttons */}
          <button
            onClick={handleToggleInvited}
            className={`px-2 py-1 text-xs rounded ${
              candidate.invited
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={candidate.emailSentAt ? `Sent: ${formatShortDate(candidate.emailSentAt)}` : 'Mark as invited'}
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
            onClick={handleToggleDeclined}
            className={`px-2 py-1 text-xs rounded ${
              candidate.declined
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {candidate.declined ? '✓ Declined' : 'Declined'}
          </button>
          {/* Bounced indicator/button - only show if email was sent */}
          {candidate.emailSentAt && candidate.responseType === 'bounced' && (
            <span className="px-2 py-1 text-xs rounded bg-orange-100 text-orange-700">
              ⚠ Bounced
            </span>
          )}
          {/* Edit and Remove buttons */}
          <button
            onClick={() => onEdit(candidate)}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600"
            title="Edit candidate info"
          >
            ✏️
          </button>
          <button
            onClick={() => onRemove(candidate.suggestionId)}
            className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600"
            title="Remove from list"
          >
            ✕
          </button>
          {/* Email sent timestamp - show below buttons */}
          {candidate.emailSentAt && (
            <span className="text-xs text-gray-400 ml-auto" title={new Date(candidate.emailSentAt).toLocaleString()}>
              📧 {formatShortDate(candidate.emailSentAt)}
            </span>
          )}
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

          {/* Email tracking details */}
          {candidate.emailSentAt && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">
                Email sent: {new Date(candidate.emailSentAt).toLocaleDateString()}
              </span>
              {candidate.responseType && candidate.responseType !== 'bounced' && (
                <span className="text-gray-500">
                  | Response: {candidate.responseType}
                  {candidate.responseReceivedAt && ` (${formatShortDate(candidate.responseReceivedAt)})`}
                </span>
              )}
              {candidate.responseType !== 'bounced' && (
                <button
                  onClick={handleMarkBounced}
                  className="px-2 py-0.5 text-xs rounded bg-orange-50 text-orange-600 hover:bg-orange-100"
                  title="Mark email as bounced"
                >
                  Mark Bounced
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">
            Saved: {new Date(candidate.savedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

// Storage key for current cycle
const CURRENT_CYCLE_KEY = 'reviewer_finder_current_cycle';

// My Candidates Tab
function MyCandidatesTab({ refreshTrigger, claudeApiKey }) {
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalData, setEmailModalData] = useState({ candidates: [], proposalInfo: {} });
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [extractingProposal, setExtractingProposal] = useState(null); // proposalId being re-extracted

  // Grant cycles state
  const [cycles, setCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('all'); // Always default to 'all' to show everything
  const [expandedProposals, setExpandedProposals] = useState(new Set());
  const [unassignedCount, setUnassignedCount] = useState({ proposals: 0, candidates: 0 });

  // Additional filters
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [piFilter, setPiFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');

  // Fetch grant cycles
  const fetchCycles = async () => {
    try {
      const response = await fetch('/api/reviewer-finder/grant-cycles');
      if (response.ok) {
        const data = await response.json();
        setCycles(data.cycles || []);
        setUnassignedCount({
          proposals: data.unassigned?.proposalCount || 0,
          candidates: data.unassigned?.candidateCount || 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch cycles:', err);
    }
  };

  const fetchCandidates = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedForDeletion(new Set());
    try {
      // Build URL with cycle filter
      let url = '/api/reviewer-finder/my-candidates';
      if (selectedCycleId && selectedCycleId !== 'all') {
        url += `?cycleId=${selectedCycleId}`;
      }

      const response = await fetch(url);
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
    fetchCycles();
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [refreshTrigger, selectedCycleId]);

  // Handle cycle filter change
  const handleCycleChange = (value) => {
    setSelectedCycleId(value);
    setExpandedProposals(new Set()); // Collapse all when switching cycles
  };

  // Toggle proposal expanded state
  const toggleProposalExpanded = (proposalId) => {
    setExpandedProposals(prev => {
      const next = new Set(prev);
      if (next.has(proposalId)) {
        next.delete(proposalId);
      } else {
        next.add(proposalId);
      }
      return next;
    });
  };

  // Expand all proposals
  const expandAll = () => {
    setExpandedProposals(new Set(proposals.map(p => p.proposalId)));
  };

  // Collapse all proposals
  const collapseAll = () => {
    setExpandedProposals(new Set());
  };

  // Onboarding modal state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCycleName, setOnboardingCycleName] = useState('');
  const [onboardingShortCode, setOnboardingShortCode] = useState('');
  const [isCreatingCycle, setIsCreatingCycle] = useState(false);

  // Check if we should show onboarding (unassigned proposals + no cycles)
  useEffect(() => {
    const shouldShowOnboarding =
      !isLoading &&
      cycles.length === 0 &&
      unassignedCount.candidates > 0 &&
      !localStorage.getItem('reviewer_finder_onboarding_dismissed');

    if (shouldShowOnboarding) {
      setShowOnboarding(true);
      // Pre-fill with suggested cycle name
      const now = new Date();
      const month = now.getMonth() < 6 ? 'June' : 'December';
      const year = now.getFullYear();
      const shortCode = `${month === 'June' ? 'J' : 'D'}${year.toString().slice(-2)}`;
      setOnboardingCycleName(`${month} ${year}`);
      setOnboardingShortCode(shortCode);
    }
  }, [isLoading, cycles.length, unassignedCount.candidates]);

  // Create cycle and assign unassigned proposals
  const handleOnboardingCreate = async () => {
    if (!onboardingCycleName.trim()) return;

    setIsCreatingCycle(true);
    try {
      // Create the cycle
      const createResponse = await fetch('/api/reviewer-finder/grant-cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: onboardingCycleName.trim(),
          shortCode: onboardingShortCode.trim() || null,
          programName: 'W. M. Keck Foundation',
        }),
      });

      if (createResponse.ok) {
        const { cycle } = await createResponse.json();

        // Assign all unassigned proposals to this cycle
        const unassignedResponse = await fetch('/api/reviewer-finder/my-candidates?cycleId=unassigned');
        const unassignedData = await unassignedResponse.json();

        if (unassignedData.proposals?.length > 0) {
          // Assign each proposal to the new cycle
          await Promise.all(
            unassignedData.proposals.map(proposal =>
              fetch('/api/reviewer-finder/my-candidates', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  proposalId: proposal.proposalId,
                  grantCycleId: cycle.id,
                }),
              })
            )
          );
        }

        // Set as current cycle
        localStorage.setItem(CURRENT_CYCLE_KEY, cycle.id.toString());
        setSelectedCycleId(cycle.id);

        // Refresh data
        await fetchCycles();
        await fetchCandidates();
      }
    } catch (err) {
      console.error('Failed to create cycle:', err);
      alert('Failed to create cycle. Please try again.');
    } finally {
      setIsCreatingCycle(false);
      setShowOnboarding(false);
    }
  };

  // Dismiss onboarding
  const handleOnboardingDismiss = () => {
    localStorage.setItem('reviewer_finder_onboarding_dismissed', 'true');
    setShowOnboarding(false);
  };

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

  const handleUpdateProposalProgram = async (proposalId, programArea) => {
    try {
      await fetch('/api/reviewer-finder/my-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, programArea })
      });
      fetchCandidates();
    } catch (err) {
      console.error('Update program area failed:', err);
    }
  };

  const handleUpdateProposalCycle = async (proposalId, grantCycleId) => {
    try {
      await fetch('/api/reviewer-finder/my-candidates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, grantCycleId })
      });
      fetchCandidates();
    } catch (err) {
      console.error('Update grant cycle failed:', err);
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

  // Handle re-extracting summary from a proposal
  const handleReExtractSummary = async (proposalId, file) => {
    if (!file) return;

    // Get summary pages setting from localStorage
    let summaryPages = '2';
    try {
      const storedCycle = localStorage.getItem('email_grant_cycle');
      if (storedCycle) {
        const decoded = JSON.parse(atob(storedCycle));
        summaryPages = decoded.summaryPages || '2';
      }
    } catch (e) {
      // Use default
    }

    setExtractingProposal(proposalId);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('proposalId', proposalId);
      formData.append('summaryPages', summaryPages);

      const response = await fetch('/api/reviewer-finder/extract-summary', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Refresh to show updated status
        fetchCandidates();
      } else {
        alert(result.message || 'Failed to extract summary');
      }
    } catch (err) {
      console.error('Extract summary failed:', err);
      alert('Failed to extract summary: ' + err.message);
    } finally {
      setExtractingProposal(null);
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
            institution: proposal.proposalInstitution || '',
            summaryBlobUrl: proposal.summaryBlobUrl || ''
          };
        }

        selectedCandidates.push(...candidatesFromProposal.map(c => ({
          suggestionId: c.suggestionId,
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

  // Extract unique values for filter dropdowns
  const uniqueInstitutions = [...new Set(
    proposals
      .map(p => p.proposalInstitution)
      .filter(Boolean)
  )].sort();

  const uniquePIs = [...new Set(
    proposals
      .map(p => p.proposalAuthors)
      .filter(Boolean)
  )].sort();

  const uniquePrograms = [...new Set(
    proposals
      .map(p => p.programArea)
      .filter(Boolean)
  )].sort();

  // Apply filters to proposals
  const filteredProposals = proposals.filter(p => {
    if (institutionFilter !== 'all' && p.proposalInstitution !== institutionFilter) {
      return false;
    }
    if (piFilter !== 'all' && p.proposalAuthors !== piFilter) {
      return false;
    }
    if (programFilter !== 'all' && p.programArea !== programFilter) {
      return false;
    }
    return true;
  });

  const totalCandidates = filteredProposals.reduce((sum, p) => sum + p.candidates.length, 0);
  const invitedCount = filteredProposals.reduce((sum, p) =>
    sum + p.candidates.filter(c => c.invited).length, 0);
  const acceptedCount = filteredProposals.reduce((sum, p) =>
    sum + p.candidates.filter(c => c.accepted).length, 0);
  const declinedCount = filteredProposals.reduce((sum, p) =>
    sum + p.candidates.filter(c => c.declined).length, 0);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">My Saved Candidates</h3>
            <p className="text-sm text-gray-500">
              {totalCandidates} candidate(s) across {filteredProposals.length} proposal(s)
              {filteredProposals.length !== proposals.length && (
                <span className="text-gray-400"> (filtered from {proposals.length})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-blue-600">{invitedCount} invited</span>
            <span className="text-green-600">{acceptedCount} accepted</span>
            <span className="text-red-600">{declinedCount} declined</span>
            {selectedForDeletion.size > 0 && (
              <>
                <button
                  onClick={handleOpenEmailModal}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Email Selected ({selectedForDeletion.size})
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

        {/* Filters & Expand/Collapse Controls */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Cycle:</label>
              <select
                value={selectedCycleId}
                onChange={(e) => handleCycleChange(e.target.value === 'all' ? 'all' : e.target.value === 'unassigned' ? 'unassigned' : parseInt(e.target.value, 10))}
                className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {unassignedCount.candidates > 0 && (
                  <option value="unassigned">Unassigned ({unassignedCount.candidates})</option>
                )}
                {cycles.filter(c => c.isActive).map(cycle => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.shortCode || cycle.name}
                  </option>
                ))}
              </select>
            </div>
            {uniqueInstitutions.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Institution:</label>
                <select
                  value={institutionFilter}
                  onChange={(e) => setInstitutionFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 max-w-[200px]"
                >
                  <option value="all">All ({uniqueInstitutions.length})</option>
                  {uniqueInstitutions.map(inst => (
                    <option key={inst} value={inst} title={inst}>
                      {inst.length > 30 ? inst.substring(0, 30) + '...' : inst}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {uniquePIs.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">PI:</label>
                <select
                  value={piFilter}
                  onChange={(e) => setPiFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 max-w-[180px]"
                >
                  <option value="all">All ({uniquePIs.length})</option>
                  {uniquePIs.map(pi => (
                    <option key={pi} value={pi} title={pi}>
                      {pi.length > 25 ? pi.substring(0, 25) + '...' : pi}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {uniquePrograms.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Program:</label>
                <select
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All ({uniquePrograms.length})</option>
                  {uniquePrograms.map(prog => (
                    <option key={prog} value={prog}>
                      {prog.includes('Medical') ? 'Medical' : 'Science & Eng'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(institutionFilter !== 'all' || piFilter !== 'all' || programFilter !== 'all') && (
              <button
                onClick={() => { setInstitutionFilter('all'); setPiFilter('all'); setProgramFilter('all'); }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </div>
          {filteredProposals.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Expand All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={collapseAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Email Settings (collapsible) */}
      <EmailSettingsPanel />

      {/* Proposals with Candidates */}
      {filteredProposals.map((proposal) => {
        const allIds = proposal.candidates.map(c => c.suggestionId);
        const allSelected = allIds.length > 0 && allIds.every(id => selectedForDeletion.has(id));
        const someSelected = allIds.some(id => selectedForDeletion.has(id));
        const isExpanded = expandedProposals.has(proposal.proposalId);

        return (
          <Card key={proposal.proposalId}>
            {/* Collapsible Header */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleProposalExpanded(proposal.proposalId)}
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-4">
                  {isExpanded ? '▼' : '▶'}
                </span>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleSelectAllInProposal(proposal);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 text-red-600 rounded border-gray-300"
                  title="Select all candidates in this proposal"
                />
                <div>
                  <h4 className="font-medium text-gray-900">
                    {proposal.proposalTitle}
                  </h4>
                  {(proposal.proposalAuthors || proposal.proposalInstitution) && (
                    <p className="text-sm text-gray-600">
                      {proposal.proposalAuthors && <span>PI: {proposal.proposalAuthors}</span>}
                      {proposal.proposalAuthors && proposal.proposalInstitution && <span> · </span>}
                      {proposal.proposalInstitution && <span>{proposal.proposalInstitution}</span>}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 flex items-center flex-wrap gap-1">
                    <span>{proposal.candidates.length} candidate(s)</span>
                    <select
                      value={proposal.programArea || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleUpdateProposalProgram(proposal.proposalId, e.target.value || null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`ml-1 px-1.5 py-0.5 rounded text-xs border-0 cursor-pointer appearance-none pr-4 ${
                        proposal.programArea?.includes('Medical')
                          ? 'bg-red-50 text-red-600'
                          : proposal.programArea?.includes('Science')
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")', backgroundPosition: 'right 0 center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                      title="Click to change program area"
                    >
                      <option value="">Not assigned</option>
                      <option value="Science and Engineering Research Program">Science & Eng</option>
                      <option value="Medical Research Program">Medical</option>
                    </select>
                    <select
                      value={proposal.grantCycleId || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        const cycleId = e.target.value ? parseInt(e.target.value, 10) : null;
                        handleUpdateProposalCycle(proposal.proposalId, cycleId);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`ml-1 px-1.5 py-0.5 rounded text-xs border-0 cursor-pointer appearance-none pr-4 ${
                        proposal.grantCycleId
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")', backgroundPosition: 'right 0 center', backgroundRepeat: 'no-repeat', backgroundSize: '1rem' }}
                      title="Click to change grant cycle"
                    >
                      <option value="">No cycle</option>
                      {cycles.filter(c => c.isActive).map(cycle => (
                        <option key={cycle.id} value={cycle.id}>
                          {cycle.shortCode || cycle.name}
                        </option>
                      ))}
                    </select>
                  </p>
                </div>
              </div>
              {/* Summary Status & Re-extract */}
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {proposal.summaryBlobUrl ? (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <span>✓</span> Summary
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">No summary</span>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleReExtractSummary(proposal.proposalId, file);
                      e.target.value = ''; // Reset for future uploads
                    }}
                    disabled={extractingProposal === proposal.proposalId}
                  />
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      extractingProposal === proposal.proposalId
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                    title="Upload proposal PDF to extract/re-extract summary page(s)"
                  >
                    {extractingProposal === proposal.proposalId
                      ? 'Extracting...'
                      : proposal.summaryBlobUrl ? 'Re-extract' : 'Extract'}
                  </span>
                </label>
              </div>
            </div>

            {/* Collapsible Content */}
            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                {proposal.candidates.map((candidate) => (
                  <SavedCandidateCard
                    key={candidate.suggestionId}
                    candidate={candidate}
                    onUpdate={handleUpdateCandidate}
                    onRemove={handleRemoveCandidate}
                    onEdit={setEditingCandidate}
                    isSelectedForDeletion={selectedForDeletion.has(candidate.suggestionId)}
                    onToggleSelection={() => handleToggleSelection(candidate.suggestionId)}
                  />
                ))}
              </div>
            )}
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
          onEmailsGenerated={fetchCandidates}
        />
      )}

      {/* Edit Candidate Modal */}
      <EditCandidateModal
        isOpen={!!editingCandidate}
        candidate={editingCandidate}
        onClose={() => setEditingCandidate(null)}
        onSave={async (suggestionId, updates) => {
          // Refresh to get updated data from database
          await fetchCandidates();
        }}
      />

      {/* Onboarding Modal for Unassigned Proposals */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleOnboardingDismiss}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Organize Your Candidates
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                You have <strong>{unassignedCount.candidates}</strong> candidate(s) across{' '}
                <strong>{unassignedCount.proposals}</strong> proposal(s) that aren&apos;t assigned
                to a grant cycle. Create a cycle to organize them.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cycle Name
                  </label>
                  <input
                    type="text"
                    value={onboardingCycleName}
                    onChange={(e) => setOnboardingCycleName(e.target.value)}
                    placeholder="June 2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Short Code (optional)
                  </label>
                  <input
                    type="text"
                    value={onboardingShortCode}
                    onChange={(e) => setOnboardingShortCode(e.target.value)}
                    placeholder="J26"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleOnboardingCreate}
                  disabled={!onboardingCycleName.trim() || isCreatingCycle}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingCycle ? 'Creating...' : 'Create & Assign All'}
                </button>
                <button
                  onClick={handleOnboardingDismiss}
                  className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Database Tab - Browse all researchers
function DatabaseTab() {
  const [researchers, setResearchers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('last_updated');
  const [sortOrder, setSortOrder] = useState('desc');
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [hasWebsiteFilter, setHasWebsiteFilter] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState([]);
  const [availableKeywords, setAvailableKeywords] = useState([]);
  const [selectedResearcherId, setSelectedResearcherId] = useState(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Duplicates state
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  // Fetch available keywords for filter dropdown
  useEffect(() => {
    const fetchKeywords = async () => {
      try {
        const response = await fetch('/api/reviewer-finder/researchers?mode=keywords');
        const data = await response.json();
        if (data.success) {
          setAvailableKeywords(data.keywords);
        }
      } catch (err) {
        console.error('Failed to fetch keywords:', err);
      }
    };
    fetchKeywords();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch researchers
  const fetchResearchers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        sortBy,
        sortOrder,
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });

      if (hasEmailFilter) params.set('hasEmail', 'true');
      if (hasWebsiteFilter) params.set('hasWebsite', 'true');
      if (keywordFilter.length > 0) params.set('keywords', keywordFilter.join(','));

      const response = await fetch(`/api/reviewer-finder/researchers?${params}`);
      const data = await response.json();

      if (data.success) {
        setResearchers(data.researchers);
        setPagination(prev => ({
          ...prev,
          total: data.total,
          hasMore: data.hasMore,
        }));
      } else {
        setError(data.error || 'Failed to fetch researchers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResearchers();
  }, [debouncedSearch, sortBy, sortOrder, hasEmailFilter, hasWebsiteFilter, keywordFilter, pagination.offset]);

  // Handle sort change
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'h_index' ? 'desc' : 'asc');
    }
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  // Pagination handlers
  const goToPage = (newOffset) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  // Sort indicator
  const SortIndicator = ({ column }) => {
    if (sortBy !== column) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  // Bulk selection handlers
  const handleToggleSelect = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === researchers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(researchers.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const response = await fetch('/api/reviewer-finder/researchers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete researchers');
      }

      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      fetchResearchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Clear selection when navigating pages or filtering
  useEffect(() => {
    setSelectedIds(new Set());
  }, [pagination.offset, debouncedSearch, hasEmailFilter, hasWebsiteFilter, keywordFilter]);

  // CSV Export - exports all matching researchers (not just current page)
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Fetch all matching researchers (up to 1000)
      const params = new URLSearchParams({
        search: debouncedSearch,
        sortBy,
        sortOrder,
        limit: '1000',
        offset: '0',
      });
      if (hasEmailFilter) params.append('hasEmail', 'true');
      if (hasWebsiteFilter) params.append('hasWebsite', 'true');
      if (keywordFilter.length > 0) params.append('keywords', keywordFilter.join(','));

      const response = await fetch(`/api/reviewer-finder/researchers?${params}`);
      const data = await response.json();

      if (!data.success || !data.researchers.length) {
        throw new Error('No researchers to export');
      }

      // Build CSV content
      const headers = ['Name', 'Affiliation', 'Email', 'Website', 'h-index', 'i10-index', 'Citations', 'ORCID', 'Keywords', 'Last Updated'];
      const rows = data.researchers.map(r => [
        r.name || '',
        r.affiliation || '',
        r.email || '',
        r.website || '',
        r.hIndex || '',
        r.i10Index || '',
        r.totalCitations || '',
        r.orcid || '',
        (r.keywords || []).map(k => k.keyword).join('; '),
        r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString() : ''
      ]);

      // Escape CSV fields
      const escapeCSV = (field) => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `researchers-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Find Duplicates
  const handleFindDuplicates = async () => {
    setIsLoadingDuplicates(true);
    setShowDuplicatesModal(true);
    try {
      const response = await fetch('/api/reviewer-finder/researchers?mode=duplicates');
      const data = await response.json();
      if (data.success) {
        setDuplicateGroups(data.duplicateGroups || []);
      } else {
        throw new Error(data.error || 'Failed to find duplicates');
      }
    } catch (err) {
      setError(err.message);
      setShowDuplicatesModal(false);
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  // Merge researchers
  const handleMerge = async (primaryId, secondaryIds) => {
    setIsMerging(true);
    try {
      const response = await fetch('/api/reviewer-finder/researchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, secondaryIds })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to merge researchers');
      }

      // Refresh duplicates list and researchers
      const dupResponse = await fetch('/api/reviewer-finder/researchers?mode=duplicates');
      const dupData = await dupResponse.json();
      if (dupData.success) {
        setDuplicateGroups(dupData.duplicateGroups || []);
      }
      fetchResearchers();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsMerging(false);
    }
  };

  if (error) {
    return (
      <Card className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
        <Button onClick={fetchResearchers} className="mt-4">Retry</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="flex-1 min-w-64">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, affiliation, or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={hasEmailFilter}
                onChange={(e) => {
                  setHasEmailFilter(e.target.checked);
                  setPagination(prev => ({ ...prev, offset: 0 }));
                }}
                className="rounded border-gray-300 text-blue-600"
              />
              Has Email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWebsiteFilter}
                onChange={(e) => {
                  setHasWebsiteFilter(e.target.checked);
                  setPagination(prev => ({ ...prev, offset: 0 }));
                }}
                className="rounded border-gray-300 text-blue-600"
              />
              Has Website
            </label>

            {/* Keyword Filter Dropdown */}
            {availableKeywords.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && !keywordFilter.includes(e.target.value)) {
                    setKeywordFilter([...keywordFilter, e.target.value]);
                    setPagination(prev => ({ ...prev, offset: 0 }));
                  }
                }}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">+ Add tag filter...</option>
                {availableKeywords
                  .filter(kw => !keywordFilter.includes(kw.keyword))
                  .map(kw => (
                    <option key={kw.keyword} value={kw.keyword}>
                      {kw.keyword} ({kw.count})
                    </option>
                  ))
                }
              </select>
            )}
          </div>

          {/* Stats and Actions */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {pagination.total} researcher{pagination.total !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleFindDuplicates}
              disabled={isLoadingDuplicates}
              className="px-3 py-1.5 text-sm text-orange-600 bg-white border border-orange-300 rounded hover:bg-orange-50 disabled:opacity-50"
              title="Find and merge duplicate researchers"
            >
              {isLoadingDuplicates ? '⏳ Searching...' : '🔍 Find Duplicates'}
            </button>
            {pagination.total > 0 && (
              <button
                onClick={handleExportCSV}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                title="Export all matching researchers to CSV"
              >
                {isExporting ? '⏳ Exporting...' : '📥 Export CSV'}
              </button>
            )}
          </div>
        </div>

        {/* Active Keyword Filters */}
        {keywordFilter.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">Active filters:</span>
            {keywordFilter.map(kw => (
              <span
                key={kw}
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                  ${kw.startsWith('source:') ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}
                `}
              >
                {kw.replace('source:', '')}
                <button
                  onClick={() => {
                    setKeywordFilter(keywordFilter.filter(k => k !== kw));
                    setPagination(prev => ({ ...prev, offset: 0 }));
                  }}
                  className="hover:opacity-70 ml-0.5"
                >
                  x
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setKeywordFilter([]);
                setPagination(prev => ({ ...prev, offset: 0 }));
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear all
            </button>
          </div>
        )}
      </Card>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              <strong>{selectedIds.size}</strong> researcher{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="px-3 py-1.5 text-sm text-red-600 bg-white border border-red-300 rounded hover:bg-red-50"
              >
                🗑️ Delete Selected
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <Card className="bg-red-50 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-800 font-medium">
                Delete {selectedIds.size} researcher{selectedIds.size !== 1 ? 's' : ''}?
              </p>
              <p className="text-sm text-red-600">
                This action cannot be undone. Proposal associations will be removed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isBulkDeleting ? 'Deleting...' : 'Yes, Delete All'}
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading && researchers.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-500">Loading researchers...</p>
          </div>
        ) : researchers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔬</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Researchers Found</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {debouncedSearch || hasEmailFilter || hasWebsiteFilter || keywordFilter.length > 0
                ? 'Try adjusting your search or filters.'
                : 'Run a search to discover and save researchers to the database.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === researchers.length && researchers.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600"
                        title="Select all on this page"
                      />
                    </th>
                    <th
                      onClick={() => handleSort('name')}
                      className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Name <SortIndicator column="name" />
                    </th>
                    <th
                      onClick={() => handleSort('affiliation')}
                      className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Affiliation <SortIndicator column="affiliation" />
                    </th>
                    <th
                      onClick={() => handleSort('h_index')}
                      className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      h-index <SortIndicator column="h_index" />
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th
                      onClick={() => handleSort('last_updated')}
                      className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    >
                      Updated <SortIndicator column="last_updated" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {researchers.map((researcher) => (
                    <ResearcherRow
                      key={researcher.id}
                      researcher={researcher}
                      onClick={() => setSelectedResearcherId(researcher.id)}
                      isSelected={selectedIds.has(researcher.id)}
                      onToggleSelect={() => handleToggleSelect(researcher.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-500">
                  Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(0)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => goToPage(Math.max(0, pagination.offset - pagination.limit))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => goToPage(pagination.offset + pagination.limit)}
                    disabled={!pagination.hasMore}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => goToPage((totalPages - 1) * pagination.limit)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Researcher Detail Modal */}
      {selectedResearcherId && (
        <ResearcherDetailModal
          researcherId={selectedResearcherId}
          onClose={() => setSelectedResearcherId(null)}
          onUpdate={fetchResearchers}
          onDelete={(deletedId) => {
            setSelectedResearcherId(null);
            fetchResearchers();
          }}
        />
      )}

      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <DuplicatesModal
          isOpen={showDuplicatesModal}
          onClose={() => setShowDuplicatesModal(false)}
          duplicateGroups={duplicateGroups}
          isLoading={isLoadingDuplicates}
          isMerging={isMerging}
          onMerge={handleMerge}
        />
      )}
    </div>
  );
}

// Duplicates Modal Component
function DuplicatesModal({ isOpen, onClose, duplicateGroups, isLoading, isMerging, onMerge }) {
  const [selectedPrimary, setSelectedPrimary] = useState({});

  if (!isOpen) return null;

  const handleMergeGroup = async (group) => {
    const primaryId = selectedPrimary[group.matchValue];
    if (!primaryId) {
      alert('Please select a primary researcher to keep');
      return;
    }
    const secondaryIds = group.researchers
      .filter(r => r.id !== primaryId)
      .map(r => r.id);
    await onMerge(primaryId, secondaryIds);
    // Clear selection for this group
    setSelectedPrimary(prev => {
      const next = { ...prev };
      delete next[group.matchValue];
      return next;
    });
  };

  const matchTypeLabels = {
    email: '📧 Same Email',
    name: '👤 Same Name',
    orcid: '🆔 Same ORCID',
    google_scholar: '🎓 Same Google Scholar'
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isMerging) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-orange-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">🔍 Potential Duplicates</h2>
            <p className="text-sm text-gray-600">
              Found {duplicateGroups.length} group{duplicateGroups.length !== 1 ? 's' : ''} of potential duplicates
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isMerging}
            className="text-gray-400 hover:text-gray-600 text-xl disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin text-4xl mb-4">⏳</div>
              <p className="text-gray-500">Scanning for duplicates...</p>
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✨</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Duplicates Found</h3>
              <p className="text-gray-500">Your researcher database looks clean!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {duplicateGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {matchTypeLabels[group.matchType] || group.matchType}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        "{group.matchValue}"
                      </span>
                    </div>
                    <button
                      onClick={() => handleMergeGroup(group)}
                      disabled={isMerging || !selectedPrimary[group.matchValue]}
                      className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isMerging ? 'Merging...' : 'Merge Selected'}
                    </button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.researchers.map((researcher) => (
                      <label
                        key={researcher.id}
                        className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 ${
                          selectedPrimary[group.matchValue] === researcher.id ? 'bg-orange-50' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`primary-${group.matchValue}`}
                          checked={selectedPrimary[group.matchValue] === researcher.id}
                          onChange={() => setSelectedPrimary(prev => ({
                            ...prev,
                            [group.matchValue]: researcher.id
                          }))}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{researcher.name}</span>
                            {researcher.hIndex && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                h:{researcher.hIndex}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate">{researcher.affiliation || 'No affiliation'}</p>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                            {researcher.email && <span>📧 {researcher.email}</span>}
                            {researcher.orcid && <span>🆔 {researcher.orcid}</span>}
                            {researcher.website && <span>🔗 Website</span>}
                            {researcher.createdAt && (
                              <span>Added: {new Date(researcher.createdAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        {selectedPrimary[group.matchValue] === researcher.id && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            Keep this one
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500">
                    Select the researcher to keep. Others will be merged into it and deleted.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            disabled={isMerging}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {duplicateGroups.length === 0 ? 'Close' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Row component for researcher table
function ResearcherRow({ researcher, onClick, isSelected, onToggleSelect }) {
  const scholarUrl = researcher.googleScholarUrl ||
    (researcher.name ? `https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(researcher.name)}` : null);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <tr
      className={`hover:bg-blue-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
      onClick={onClick}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-gray-300 text-blue-600"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{researcher.name}</span>
          {scholarUrl && (
            <a
              href={scholarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700"
              title="Google Scholar"
            >
              🎓
            </a>
          )}
        </div>
        {/* Keywords/Tags */}
        {researcher.keywords && researcher.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {researcher.keywords.slice(0, 5).map((kw, i) => (
              <span
                key={i}
                className={`
                  inline-flex items-center px-1.5 py-0.5 text-xs rounded
                  ${kw.source === 'claude' ? 'bg-purple-100 text-purple-700' :
                    kw.keyword.startsWith('source:') ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-600'}
                `}
                title={`Source: ${kw.source}`}
              >
                {kw.keyword.replace('source:', '')}
              </span>
            ))}
            {researcher.keywords.length > 5 && (
              <span className="text-xs text-gray-400">
                +{researcher.keywords.length - 5}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={researcher.affiliation}>
        {researcher.affiliation || '-'}
      </td>
      <td className="px-4 py-3 text-center">
        {researcher.hIndex ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            {researcher.hIndex}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          {researcher.email ? (
            <a
              href={`mailto:${researcher.email}`}
              className="text-green-600 hover:text-green-800"
              title={researcher.email}
            >
              ✉️
            </a>
          ) : (
            <span className="text-gray-300" title="No email">✉️</span>
          )}
          {researcher.website || researcher.facultyPageUrl ? (
            <a
              href={researcher.website || researcher.facultyPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              title={researcher.website || researcher.facultyPageUrl}
            >
              🔗
            </a>
          ) : (
            <span className="text-gray-300" title="No website">🔗</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(researcher.lastUpdated)}
      </td>
    </tr>
  );
}

// Main Page Component
export default function ReviewerFinderPage() {
  const [activeTab, setActiveTab] = useState('search');
  const [apiKey, setApiKey] = useState('');
  const [myCandidatesRefresh, setMyCandidatesRefresh] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
    { id: 'search', label: 'Search', icon: '🔍' },
    { id: 'candidates', label: 'My Candidates', icon: '📋' },
    { id: 'database', label: 'Database', icon: '🗄️' }
  ];

  return (
    <Layout
      title="Reviewer Finder"
      description="Find qualified peer reviewers using AI analysis and academic database verification"
    >
      <PageHeader
        title="Reviewer Finder"
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

          {/* Model Indicator */}
          <div className="flex items-center gap-2 mb-4 pt-3 border-t border-gray-200">
            <span className="text-lg">🤖</span>
            <span className="text-sm text-gray-600">
              Model: <strong className="text-gray-800">{getModelDisplayName(BASE_CONFIG.APP_MODELS?.['reviewer-finder']?.model || BASE_CONFIG.CLAUDE.DEFAULT_MODEL)}</strong>
            </span>
          </div>

          {/* Optional API Settings (ORCID, NCBI) */}
          <ApiSettingsPanel onSettingsChange={handleApiSettingsChange} />
        </Card>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between">
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
            {/* Settings Gear Icon */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors mr-2"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'search' && <NewSearchTab apiKey={apiKey} apiSettings={apiSettings} onCandidatesSaved={handleCandidatesSaved} searchState={searchState} setSearchState={setSearchState} />}
          {activeTab === 'candidates' && <MyCandidatesTab refreshTrigger={myCandidatesRefresh} claudeApiKey={apiKey} />}
          {activeTab === 'database' && <DatabaseTab />}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </Layout>
  );
}
