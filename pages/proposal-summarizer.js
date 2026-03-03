import { useState, useCallback, useEffect, useRef } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ResultsDisplay from '../shared/components/ResultsDisplay';
import RequireAppAccess from '../shared/components/RequireAppAccess';
import ErrorAlert from '../shared/components/ErrorAlert';
import { useProfile } from '../shared/context/ProfileContext';
import { parseSections } from '../shared/config/prompts/proposal-summarizer';

function ProposalSummarizer() {
  const { profileName } = useProfile();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [showQAModal, setShowQAModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [qaMessages, setQAMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isQAProcessing, setIsQAProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedFileForQA, setSelectedFileForQA] = useState('');
  const [selectedFileForRefine, setSelectedFileForRefine] = useState('');

  // Staff Lead — pre-filled from profile, editable
  const [staffLead, setStaffLead] = useState('');

  // Word export modal state
  const [showWordExportModal, setShowWordExportModal] = useState(false);
  const [selectedFileForExport, setSelectedFileForExport] = useState('');
  const [selectedResultForExport, setSelectedResultForExport] = useState(null);
  const [wordExportFields, setWordExportFields] = useState({
    institution: '',
    cityState: '',
    piName: '',
    projectTitle: '',
    requestedAmount: '',
    programType: 'Science and Engineering',
    invitedAmount: '',
    projectBudget: '',
    recommendation: '',
    shortTitle: '',
  });
  const [isGeneratingWord, setIsGeneratingWord] = useState(false);

  // Initialize staff lead from profile name
  useEffect(() => {
    if (profileName && !staffLead) {
      setStaffLead(profileName);
    }
  }, [profileName]);

  const handleFilesUploaded = useCallback((uploadedFiles) => {
    setSelectedFiles(uploadedFiles);
    setError(null);
    setResults(null);
  }, []);

  const processProposals = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select PDF files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting proposal processing...');
    setError(null);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: selectedFiles
        })
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If JSON parsing fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.progress !== undefined) {
                setProgress(data.progress);
              }

              if (data.message) {
                setProgressText(data.message);
              }

              if (data.results) {
                setResults(data.results);
              }
            } catch (e) {
              console.error('Failed to parse streaming data:', e);
            }
          }
        }
      }

      setProgressText('Processing complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message || 'Failed to process proposals');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefine = async (filename, currentSummary) => {
    setSelectedFileForRefine(filename);
    setShowFeedbackModal(true);
  };

  const submitRefinement = async () => {
    if (!feedbackText.trim()) {
      setError('Please provide feedback for refinement');
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentSummary: results[selectedFileForRefine].formatted,
          feedback: feedbackText
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine summary');
      }

      setResults(prev => ({
        ...prev,
        [selectedFileForRefine]: {
          ...prev[selectedFileForRefine],
          formatted: data.refinedSummary
        }
      }));

      setFeedbackText('');
      setSelectedFileForRefine('');
      setShowFeedbackModal(false);

    } catch (error) {
      console.error('Refinement error:', error);
      setError(error.message || 'Failed to refine summary');
    } finally {
      setIsRefining(false);
    }
  };

  const handleQuestionAsk = async (filename) => {
    setSelectedFileForQA(filename);
    setQAMessages([]);
    setShowQAModal(true);
  };

  // Ref for auto-scrolling the chat container
  const qaChatRef = useRef(null);
  // Ref to track abort controller for cancelling streams
  const qaAbortRef = useRef(null);

  // Auto-scroll chat when messages change
  useEffect(() => {
    if (qaChatRef.current) {
      qaChatRef.current.scrollTop = qaChatRef.current.scrollHeight;
    }
  }, [qaMessages]);

  const submitQuestion = async () => {
    if (!currentQuestion.trim()) {
      setError('Please enter a question');
      return;
    }

    setIsQAProcessing(true);
    const question = currentQuestion;
    setCurrentQuestion('');

    // Add user message
    setQAMessages(prev => [...prev, { role: 'user', content: question }]);

    // Add thinking indicator
    setQAMessages(prev => [...prev, { role: 'assistant', content: '', isThinking: true, thinkingText: 'Analyzing your question...' }]);

    const abortController = new AbortController();
    qaAbortRef.current = abortController;

    try {
      const result = results[selectedFileForQA];
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          question,
          messages: qaMessages.filter(m => !m.isThinking && !m.isError).map(m => ({ role: m.role, content: m.content })),
          proposalText: result.extractedText || '',
          summaryText: result.formatted || '',
          filename: selectedFileForQA,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const chunk of lines) {
          const eventMatch = chunk.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!eventMatch) continue;

          const [, eventType, eventData] = eventMatch;
          let parsed;
          try {
            parsed = JSON.parse(eventData);
          } catch {
            continue;
          }

          switch (eventType) {
            case 'thinking':
              // Update thinking indicator text
              setQAMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.isThinking) {
                  updated[updated.length - 1] = { ...last, thinkingText: parsed.message };
                }
                return updated;
              });
              break;

            case 'text_delta':
              streamedText += parsed.text;
              // Replace thinking indicator with streaming message, or update streaming message
              setQAMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                const last = updated[lastIdx];
                if (last && (last.isThinking || last.isStreaming)) {
                  updated[lastIdx] = { role: 'assistant', content: streamedText, isStreaming: true };
                } else {
                  updated.push({ role: 'assistant', content: streamedText, isStreaming: true });
                }
                return updated;
              });
              break;

            case 'complete':
              // Finalize the message
              setQAMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.isStreaming || updated[lastIdx]?.isThinking) {
                  updated[lastIdx] = { role: 'assistant', content: streamedText || 'No response received.' };
                }
                return updated;
              });
              break;

            case 'error':
              setQAMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.isThinking || updated[lastIdx]?.isStreaming) {
                  updated[lastIdx] = { role: 'assistant', content: parsed.message, isError: true };
                } else {
                  updated.push({ role: 'assistant', content: parsed.message, isError: true });
                }
                return updated;
              });
              break;
          }
        }
      }

      // Ensure finalization if stream ends without 'complete' event
      setQAMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isStreaming) {
          updated[lastIdx] = { role: 'assistant', content: streamedText || 'No response received.' };
        } else if (updated[lastIdx]?.isThinking) {
          updated[lastIdx] = { role: 'assistant', content: streamedText || 'No response received.' };
        }
        return updated;
      });

    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Q&A error:', error);
      setQAMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isThinking || updated[lastIdx]?.isStreaming) {
          updated[lastIdx] = { role: 'assistant', content: error.message || 'Failed to get answer', isError: true };
        } else {
          updated.push({ role: 'assistant', content: error.message || 'Failed to get answer', isError: true });
        }
        return updated;
      });
    } finally {
      setIsQAProcessing(false);
      qaAbortRef.current = null;
    }
  };

  // --- Word Export ---
  const handleWordExport = (filename, result) => {
    setSelectedFileForExport(filename);
    setSelectedResultForExport(result);

    // Pre-fill from structured data
    const structured = result.structured || {};
    setWordExportFields(prev => ({
      ...prev,
      institution: structured.institution && structured.institution !== 'Not specified'
        ? structured.institution : '',
      cityState: structured.city_state || '',
      piName: structured.principal_investigator && structured.principal_investigator !== 'Not specified'
        ? structured.principal_investigator : '',
      projectTitle: structured.project_title || '',
      requestedAmount: structured.funding_amount && structured.funding_amount !== 'Not specified'
        ? structured.funding_amount : '',
      staffLead: staffLead,
    }));

    setShowWordExportModal(true);
  };

  const generateWordDocument = async () => {
    setIsGeneratingWord(true);
    setError(null);

    try {
      const { generatePhaseIIDocument } = await import('../shared/utils/word-export');

      const result = selectedResultForExport;
      const sections = parseSections(result.formatted);
      // Use editable fields as overrides over raw AI extraction
      const metadata = {
        ...(result.structured || {}),
        institution: wordExportFields.institution || result.structured?.institution,
        city_state: wordExportFields.cityState || result.structured?.city_state,
        principal_investigator: wordExportFields.piName || result.structured?.principal_investigator,
        project_title: wordExportFields.projectTitle || result.structured?.project_title,
      };

      const blob = await generatePhaseIIDocument(sections, metadata, {
        ...wordExportFields,
        staffLead: wordExportFields.staffLead || staffLead,
      });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanFilename = selectedFileForExport.replace(/\.[^/.]+$/, '');
      a.download = `${cleanFilename}_Phase_II_Writeup.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowWordExportModal(false);
    } catch (err) {
      console.error('Word export error:', err);
      setError(`Failed to generate Word document: ${err.message}`);
    } finally {
      setIsGeneratingWord(false);
    }
  };

  const updateExportField = (field, value) => {
    setWordExportFields(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Layout
      title="Create Phase II Writeup Draft"
      description="Generate standardized writeup drafts from PDF research proposals using Claude AI"
    >
      <PageHeader
        title="Create Phase II Writeup Draft"
        subtitle="Generate standardized writeup drafts from PDF research proposals using Claude AI"
        icon="✍️"
      />

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      <Card className="mb-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span>📁</span>
            <span>Upload Research Proposals</span>
          </h2>
        </div>

        {/* Staff Lead field */}
        <div className="mb-4">
          <label htmlFor="staff-lead" className="block text-sm font-medium text-gray-700 mb-1">
            Staff Lead
          </label>
          <input
            id="staff-lead"
            type="text"
            value={staffLead}
            onChange={(e) => setStaffLead(e.target.value)}
            placeholder="Enter staff lead name"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">Pre-filled from your profile. Used in Word template export.</p>
        </div>

        <FileUploaderSimple
          onFilesUploaded={handleFilesUploaded}
          multiple={true}
          accept=".pdf"
          maxSize={50 * 1024 * 1024}
        />
      </Card>

      {selectedFiles.length > 0 && !processing && !results && (
        <Card className="mb-6 bg-green-50 border-green-200">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Process</h3>
            <p className="text-gray-700 mb-4">
              {selectedFiles.length} proposal{selectedFiles.length > 1 ? 's' : ''} uploaded and ready for Phase II writeup generation
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={processProposals}
            >
              Generate Writeup Drafts
            </Button>
          </div>
        </Card>
      )}

      {processing && (
        <Card className="mb-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
              <span className="text-gray-700 font-medium">{progressText}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="bg-gray-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-sm text-gray-600">{progress}%</div>
          </div>
        </Card>
      )}

      {results && (
        <div className="mt-8">
          <ResultsDisplay
            results={results}
            onRefine={handleRefine}
            onQuestionAsk={handleQuestionAsk}
            onWordExport={handleWordExport}
            showActions={true}
            exportFormats={['markdown', 'json']}
          />
        </div>
      )}

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
            New Proposals
          </Button>
        </div>
      )}

      {/* Q&A Modal */}
      {showQAModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => { if (!isQAProcessing) setShowQAModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Ask Questions - {selectedFileForQA}</h2>
              <button onClick={() => { if (qaAbortRef.current) qaAbortRef.current.abort(); setShowQAModal(false); }} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <div ref={qaChatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {qaMessages.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <p className="text-sm">Ask questions about this proposal. Claude can search the web for PI publications, institutional context, and related research.</p>
                  </div>
                )}
                {qaMessages.map((msg, index) => {
                  if (msg.isThinking) {
                    return (
                      <div key={index} className="flex justify-start">
                        <div className="bg-gray-100 text-gray-600 p-3 rounded-lg flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                          <span className="text-sm">{msg.thinkingText || 'Thinking...'}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : msg.isError
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-gray-100 text-gray-900'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}{msg.isStreaming && <span className="inline-block w-2 h-4 bg-gray-400 ml-0.5 animate-pulse" />}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-200 p-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentQuestion}
                    onChange={(e) => setCurrentQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isQAProcessing && submitQuestion()}
                    placeholder="Ask a question about this proposal..."
                    disabled={isQAProcessing}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Button
                    variant="primary"
                    onClick={submitQuestion}
                    disabled={isQAProcessing || !currentQuestion.trim()}
                  >
                    Ask
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={isRefining ? null : () => setShowFeedbackModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Refine Summary - {selectedFileForRefine}</h2>
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                disabled={isRefining}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              {isRefining ? (
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
                    <span className="text-gray-700 font-medium">Claude is refining your summary...</span>
                  </div>
                  <p className="text-gray-600">Please wait while your feedback is being processed and incorporated into an improved summary.</p>
                  <div className="bg-gray-50 p-4 rounded-lg text-left">
                    <p className="font-medium text-gray-900 mb-2">Your feedback:</p>
                    <p className="text-gray-700 italic">&quot;{feedbackText}&quot;</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Provide specific feedback on how to improve the summary..."
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => setShowFeedbackModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={submitRefinement}
                      disabled={isRefining || !feedbackText.trim()}
                    >
                      {isRefining ? 'Refining...' : 'Refine Summary'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Word Export Modal */}
      {showWordExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={isGeneratingWord ? null : () => setShowWordExportModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Export Word Document</h2>
              <button
                onClick={() => setShowWordExportModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                disabled={isGeneratingWord}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-600 mb-4">
                Review and complete the fields below. Pre-filled values come from the AI analysis. The generated Word document will follow the Keck Phase II writeup template format.
              </p>

              <div className="space-y-4">
                {/* Pre-filled from Claude */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">From AI Analysis (editable)</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                    <input
                      type="text"
                      value={wordExportFields.institution}
                      onChange={(e) => updateExportField('institution', e.target.value)}
                      placeholder="Institution name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City, State</label>
                    <input
                      type="text"
                      value={wordExportFields.cityState}
                      onChange={(e) => updateExportField('cityState', e.target.value)}
                      placeholder="e.g., Pasadena, California"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PI Name</label>
                    <input
                      type="text"
                      value={wordExportFields.piName}
                      onChange={(e) => updateExportField('piName', e.target.value)}
                      placeholder="Principal Investigator name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                    <input
                      type="text"
                      value={wordExportFields.projectTitle}
                      onChange={(e) => updateExportField('projectTitle', e.target.value)}
                      placeholder="Full project title"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Requested Amount</label>
                    <input
                      type="text"
                      value={wordExportFields.requestedAmount}
                      onChange={(e) => updateExportField('requestedAmount', e.target.value)}
                      placeholder="e.g., $1,000,000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Internal fields */}
                <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Internal Fields</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
                    <select
                      value={wordExportFields.programType}
                      onChange={(e) => updateExportField('programType', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Science and Engineering">Science and Engineering</option>
                      <option value="Medical Research">Medical Research</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Lead</label>
                    <input
                      type="text"
                      value={wordExportFields.staffLead || staffLead}
                      onChange={(e) => updateExportField('staffLead', e.target.value)}
                      placeholder="Staff lead name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Short Title (for header)</label>
                    <input
                      type="text"
                      value={wordExportFields.shortTitle}
                      onChange={(e) => updateExportField('shortTitle', e.target.value)}
                      placeholder="Abbreviated project title for page header"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invited Amount ($)</label>
                      <input
                        type="text"
                        value={wordExportFields.invitedAmount}
                        onChange={(e) => updateExportField('invitedAmount', e.target.value)}
                        placeholder="e.g., $1,000,000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project Budget ($)</label>
                      <input
                        type="text"
                        value={wordExportFields.projectBudget}
                        onChange={(e) => updateExportField('projectBudget', e.target.value)}
                        placeholder="e.g., $1,500,000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recommendation ($)</label>
                    <input
                      type="text"
                      value={wordExportFields.recommendation}
                      onChange={(e) => updateExportField('recommendation', e.target.value)}
                      placeholder="e.g., $1,000,000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowWordExportModal(false)}
                disabled={isGeneratingWord}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={generateWordDocument}
                disabled={isGeneratingWord}
              >
                {isGeneratingWord ? 'Generating...' : 'Generate Word Document'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function ProposalSummarizerPage() {
  return <RequireAppAccess appKey="proposal-summarizer"><ProposalSummarizer /></RequireAppAccess>;
}
