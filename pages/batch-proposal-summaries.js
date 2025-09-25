import { useState, useCallback } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';

export default function BatchProposalSummaries() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [summaryLength, setSummaryLength] = useState(2);
  const [summaryLevel, setSummaryLevel] = useState('technical-non-expert');
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

  const processBatch = async () => {
    if (!apiKey) {
      setError('Please provide an API key');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Please select PDF files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting batch processing...');
    setError(null);

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          files: selectedFiles,
          summaryLength,
          summaryLevel,
          apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response with simplified parsing
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Process complete lines
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

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
                // Silently continue on parse errors to avoid breaking the stream
                continue;
              }
            }
          }
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        throw new Error('Failed to process server response stream');
      }

      setProgressText('Batch processing complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Provide more specific error messages
      let errorMessage = 'Failed to process batch';
      if (error.name === 'SyntaxError') {
        errorMessage = 'Error parsing server response. Please try again.';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'Invalid API key. Please check your API key and try again.';
      } else {
        errorMessage = error.message || 'Failed to process batch';
      }
      
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const exportAllAsMarkdown = () => {
    if (!results || Object.keys(results).length === 0) return;

    let content = `# Batch Proposal Summaries\n\n`;
    content += `Generated on: ${new Date().toLocaleDateString()}\n`;
    content += `Summary Length: ${summaryLength} pages\n`;
    content += `Technical Level: ${summaryLevel}\n`;
    content += `Documents Processed: ${Object.keys(results).length}\n\n`;
    content += `---\n\n`;

    Object.entries(results).forEach(([filename, result], index) => {
      content += `# ${index + 1}. ${filename}\n\n`;
      if (result.metadata?.error) {
        content += `❌ **Error**: ${result.metadata.errorMessage}\n\n`;
      } else {
        content += `${result.formatted}\n\n`;
        if (result.metadata) {
          content += `**Document Info**: ${result.metadata.pages || 'N/A'} pages, ${result.metadata.wordCount || 'N/A'} words\n\n`;
        }
      }
      content += `---\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_summaries_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout 
      title="Batch Proposal Summaries"
      description="Process multiple proposals at once with customizable summary length"
    >
      <PageHeader 
        title="Batch Proposal Summaries"
        subtitle="Process multiple research proposals simultaneously with customizable summary length and technical level"
        icon="📚"
      />

      <Card className="mb-8">
        <div className="text-center">
          <ApiKeyManager 
            onApiKeySet={handleApiKeySet}
            required={true}
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
        <Card>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>⚙️</span>
              <span>Summary Configuration</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="summaryLength" className="block text-sm font-medium text-gray-700">
                  Summary Length
                </label>
                <select
                  id="summaryLength"
                  value={summaryLength}
                  onChange={(e) => setSummaryLength(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={processing}
                >
                  <option value={1}>1 page (concise)</option>
                  <option value={2}>2 pages (standard)</option>
                  <option value={3}>3 pages (detailed)</option>
                  <option value={4}>4 pages (comprehensive)</option>
                  <option value={5}>5 pages (extensive)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="summaryLevel" className="block text-sm font-medium text-gray-700">
                  Technical Level
                </label>
                <select
                  id="summaryLevel"
                  value={summaryLevel}
                  onChange={(e) => setSummaryLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={processing}
                >
                  <option value="general-audience">General Audience</option>
                  <option value="technical-non-expert">Technical (Non-Expert)</option>
                  <option value="technical-expert">Technical (Expert)</option>
                  <option value="academic">Academic/Scientific</option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>📁</span>
              <span>Upload Proposals</span>
            </h2>
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
                {selectedFiles.length} proposal{selectedFiles.length > 1 ? 's' : ''} uploaded and ready for batch processing
                <br />
                Summary: {summaryLength} page{summaryLength > 1 ? 's' : ''} • Level: {summaryLevel ? summaryLevel.replace('-', ' ') : 'technical non expert'}
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={processBatch}
              >
                🚀 Process Batch
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
            <Card className="mt-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <span>📄</span>
                  <span>Batch Results</span>
                </h2>
                <Button
                  variant="secondary"
                  onClick={exportAllAsMarkdown}
                >
                  📝 Export All as Markdown
                </Button>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg mb-6 text-center">
                <p className="text-gray-700">
                  Processed {Object.keys(results).length} document{Object.keys(results).length > 1 ? 's' : ''} • 
                  {Object.values(results).filter(r => r.metadata?.error).length} error{Object.values(results).filter(r => r.metadata?.error).length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Object.entries(results).map(([filename, result], index) => (
                  <div key={filename} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="text-base font-medium text-gray-900 truncate">
                        {index + 1}. {filename}
                      </h3>
                      {result.metadata?.error && (
                        <span className="text-sm text-red-600 font-medium">❌ Error</span>
                      )}
                    </div>
                    
                    <div className="p-4">
                      {result.metadata?.error ? (
                        <p className="text-red-600">
                          {result.metadata.errorMessage}
                        </p>
                      ) : (
                        <>
                          <div className="text-gray-700 leading-relaxed">
                            {result.formatted && typeof result.formatted === 'string' ? 
                              result.formatted.split('\n').slice(0, 5).map((line, i) => (
                                <p key={i} className="mb-2">{line}</p>
                              )) : 
                              <p>No summary available</p>
                            }
                            {result.formatted && typeof result.formatted === 'string' && result.formatted.split('\n').length > 5 && (
                              <p className="mb-2"><em className="text-gray-500">... (truncated in preview)</em></p>
                            )}
                          </div>
                          
                          {result.metadata && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <p className="text-sm text-gray-600">
                                {result.metadata.pages && `${result.metadata.pages} pages • `}
                                {result.metadata.wordCount && `${result.metadata.wordCount.toLocaleString()} words`}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
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
                📚 New Batch
              </Button>
            </div>
          )}
      </div>

    </Layout>
  );
}