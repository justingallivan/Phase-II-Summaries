import { useState, useCallback } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import FileUploaderSimple from '../shared/components/FileUploaderSimple';
import ApiKeyManager from '../shared/components/ApiKeyManager';
import ResultsDisplay from '../shared/components/ResultsDisplay';

export default function DocumentAnalyzer() {
  const [apiKey, setApiKey] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
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

  const processDocuments = async () => {
    if (!apiKey) {
      setError('Please provide an API key');
      return;
    }

    if (selectedFiles.length === 0) {
      setError('Please select files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setProgressText('Starting document analysis...');
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
          apiKey
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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

      setProgressText('Analysis complete!');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Processing error:', error);
      setError(error.message || 'Failed to process documents');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefine = async (filename, currentSummary) => {
    const feedback = prompt('Please provide feedback for refining this summary:');
    if (!feedback) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          currentSummary,
          feedback,
          apiKey
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to refine summary');
      }

      setResults(prev => ({
        ...prev,
        [filename]: {
          ...prev[filename],
          formatted: data.refinedSummary
        }
      }));

    } catch (error) {
      console.error('Refinement error:', error);
      setError(error.message || 'Failed to refine summary');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Layout 
      title="Document Analyzer - AI-Powered Analysis"
      description="Analyze documents with AI for insights and summaries"
    >
      <PageHeader 
        title="Document Analyzer"
        subtitle="Upload documents for comprehensive AI-powered analysis and insights"
        icon="🔍"
      />

      <Card className="mb-8">
        <div className="text-center">
          <ApiKeyManager 
            onApiKeySet={handleApiKeySet}
            required={true}
          />
        </div>
      </Card>

      <div className="space-y-6">
        {error && (
          <Card className="border-red-200 bg-red-50">
            <div className="flex items-center gap-3">
              <span className="text-red-600 text-xl">⚠️</span>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </Card>
        )}

        <Card className="mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span>📁</span>
              <span>Upload Documents</span>
            </h2>
          </div>
          <FileUploaderSimple
            onFilesUploaded={handleFilesUploaded}
            multiple={true}
            accept=".pdf,.txt,.md"
            maxSize={50 * 1024 * 1024} // 50MB limit with blob storage
          />
        </Card>

        {selectedFiles.length > 0 && !processing && !results && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Process</h3>
              <p className="text-gray-700 mb-4">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} uploaded and ready for analysis
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={processDocuments}
              >
                🚀 Analyze Documents
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
              📄 New Analysis
            </Button>
          </div>
        )}
      </div>

    </Layout>
  );
}