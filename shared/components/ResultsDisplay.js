import { useState } from 'react';
import styles from './ResultsDisplay.module.css';

export default function ResultsDisplay({ 
  results, 
  onRefine, 
  onQuestionAsk,
  showActions = true,
  exportFormats = ['markdown', 'json'],
  hideMetadata = false
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [copySuccess, setCopySuccess] = useState({});

  if (!results || Object.keys(results).length === 0) {
    return null;
  }

  const resultEntries = Object.entries(results);

  const copyToClipboard = async (text, filename) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess({ [filename]: true });
      setTimeout(() => {
        setCopySuccess({ [filename]: false });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const exportAsMarkdown = (filename, content) => {
    // Ensure content is a string
    if (!content || typeof content !== 'string') {
      console.error('Invalid content for export:', content);
      content = 'No content available';
    }
    
    // Convert HTML tags to proper markdown formatting (preserve underline tags)
    let markdownContent = content
      // Convert bold tags to markdown bold
      .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      // Convert italic tags to markdown italic
      .replace(/<em>(.*?)<\/em>/g, '*$1*')
      .replace(/<i>(.*?)<\/i>/g, '*$1*')
      // Convert paragraph tags
      .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
      // Convert line breaks
      .replace(/<br\s*\/?>/g, '\n')
      // Remove other HTML tags but preserve <u> tags for underlines
      .replace(/<(?!u\b|\/u\b)[^>]*>/g, '')
      // Clean up multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Trim whitespace
      .trim();

    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.[^/.]+$/, '')}_summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsJSON = (filename, result) => {
    const exportData = {
      filename,
      summary: result.formatted,
      metadata: result.metadata,
      structuredData: result.structured,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.[^/.]+$/, '')}_summary.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = (filename, result) => {
    if (!result.csvData || typeof result.csvData !== 'string') {
      console.warn('No CSV data available for export', result.csvData);
      return;
    }
    
    try {
      const blob = new Blob([result.csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Clean filename more safely
      const cleanFilename = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
      a.download = `${cleanFilename}_reviewers.csv`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV file. Please try again.');
    }
  };

  const exportAllAsZip = async () => {
    const zip = await import('jszip').then(m => new m.default());
    
    resultEntries.forEach(([filename, result]) => {
      if (!result.metadata?.error) {
        zip.file(
          `${filename.replace(/\.[^/.]+$/, '')}_summary.md`,
          result.formatted || ''
        );
        
        const jsonData = {
          filename,
          summary: result.formatted,
          metadata: result.metadata,
          structuredData: result.structured,
          timestamp: new Date().toISOString()
        };
        zip.file(
          `${filename.replace(/\.[^/.]+$/, '')}_summary.json`,
          JSON.stringify(jsonData, null, 2)
        );
      }
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summaries_${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.resultsContainer}>
      <div className={styles.resultsHeader}>
        <h2 className={styles.title}>
          📄 Results ({resultEntries.length} document{resultEntries.length > 1 ? 's' : ''})
        </h2>
        {resultEntries.length > 1 && exportFormats.includes('zip') && (
          <button onClick={exportAllAsZip} className={styles.exportAllButton}>
            📦 Export All as ZIP
          </button>
        )}
      </div>

      {resultEntries.length > 1 && (
        <div className={styles.tabs}>
          {resultEntries.map(([filename], index) => (
            <button
              key={filename}
              className={`${styles.tab} ${activeTab === index ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(index)}
            >
              {filename.length > 30 ? `${filename.substring(0, 27)}...` : filename}
              {results[filename]?.metadata?.error && ' ⚠️'}
            </button>
          ))}
        </div>
      )}

      <div className={styles.resultContent}>
        {resultEntries.map(([filename, result], index) => (
          <div
            key={filename}
            className={styles.resultPanel}
            style={{ display: activeTab === index || resultEntries.length === 1 ? 'block' : 'none' }}
          >
            {result.metadata?.error ? (
              <div className={styles.errorResult}>
                <h3>❌ Error Processing File</h3>
                <p>{result.metadata.errorMessage || 'An unexpected error occurred'}</p>
              </div>
            ) : (
              <>
                <div className={styles.summarySection}>
                  <div className={styles.sectionHeader}>
                    <h3>Summary</h3>
                    <div className={styles.actions}>
                      <button
                        onClick={() => copyToClipboard(result.formatted, filename)}
                        className={styles.actionButton}
                        title="Copy to clipboard"
                      >
                        {copySuccess[filename] ? '✓ Copied' : '📋 Copy'}
                      </button>
                      {exportFormats.includes('markdown') && (
                        <button
                          onClick={() => exportAsMarkdown(filename, result.formatted)}
                          className={styles.actionButton}
                          title="Export as Markdown"
                        >
                          📝 Markdown
                        </button>
                      )}
                      {exportFormats.includes('json') && (
                        <button
                          onClick={() => exportAsJSON(filename, result)}
                          className={styles.actionButton}
                          title="Export as JSON"
                        >
                          📊 JSON
                        </button>
                      )}
                      {exportFormats.includes('csv') && result.csvData && (
                        <button
                          onClick={() => exportAsCSV(filename, result)}
                          className={styles.actionButton}
                          title="Export reviewers as CSV"
                        >
                          📈 CSV
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.summaryText}>
                    {result.formatted?.split('\n').map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                {!hideMetadata && result.metadata && (
                  <div className={styles.metadataSection}>
                    <h4>Document Information</h4>
                    <div className={styles.metadata}>
                      {result.metadata.pages && (
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Pages:</span>
                          <span className={styles.metaValue}>{result.metadata.pages}</span>
                        </div>
                      )}
                      {result.metadata.wordCount && (
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Words:</span>
                          <span className={styles.metaValue}>
                            {result.metadata.wordCount.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {result.metadata.characterCount && (
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Characters:</span>
                          <span className={styles.metaValue}>
                            {result.metadata.characterCount.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {result.metadata.truncated && (
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>⚠️</span>
                          <span className={styles.metaValue}>
                            Text was truncated for processing
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!hideMetadata && result.structured && (
                  <div className={styles.structuredDataSection}>
                    <h4>Extracted Data</h4>
                    <div className={styles.structuredData}>
                      <pre>{JSON.stringify(result.structured, null, 2)}</pre>
                    </div>
                  </div>
                )}

                {showActions && (
                  <div className={styles.interactionButtons}>
                    {onRefine && (
                      <button
                        onClick={() => onRefine(filename, result.formatted)}
                        className={styles.refineButton}
                      >
                        ✏️ Refine Summary
                      </button>
                    )}
                    {onQuestionAsk && (
                      <button
                        onClick={() => onQuestionAsk(filename)}
                        className={styles.qaButton}
                      >
                        💬 Ask Questions
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}