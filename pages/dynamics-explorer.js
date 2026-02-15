import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';
import { useProfile } from '../shared/context/ProfileContext';
import RequireAppAccess from '../shared/components/RequireAppAccess';

// ─── Markdown table parser ───

function parseMarkdownTables(text) {
  // Split text into segments: regular text and table blocks
  const lines = text.split('\n');
  const segments = [];
  let currentText = [];
  let tableLines = [];
  let inTable = false;

  for (const line of lines) {
    const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isSeparator = /^\|[\s\-:|]+\|$/.test(line.trim());

    if (isTableLine || isSeparator) {
      if (!inTable) {
        // Flush text before table
        if (currentText.length > 0) {
          segments.push({ type: 'text', content: currentText.join('\n') });
          currentText = [];
        }
        inTable = true;
      }
      tableLines.push(line);
    } else {
      if (inTable) {
        // Flush table
        segments.push(parseTable(tableLines));
        tableLines = [];
        inTable = false;
      }
      currentText.push(line);
    }
  }

  // Flush remaining
  if (inTable && tableLines.length > 0) {
    segments.push(parseTable(tableLines));
  }
  if (currentText.length > 0) {
    segments.push({ type: 'text', content: currentText.join('\n') });
  }

  return segments;
}

function parseTable(lines) {
  const rows = lines
    .filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim())) // skip separator
    .map(l =>
      l.trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim())
    );

  if (rows.length === 0) return { type: 'text', content: lines.join('\n') };

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return { type: 'table', headers, rows: dataRows };
}

function tableToCsv(headers, rows) {
  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const csvLines = [headers.map(escape).join(',')];
  for (const row of rows) {
    csvLines.push(row.map(escape).join(','));
  }
  return csvLines.join('\n');
}

function downloadCsv(headers, rows, filename) {
  const csv = tableToCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Simple markdown renderer ───

function renderMarkdownText(text) {
  if (!text) return null;
  // Bold
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>');
  // Line breaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

// ─── Example query chips ───

const EXAMPLE_QUERIES = [
  'How many proposals are there?',
  'Show me the 10 most recent proposals',
  'What tables are available?',
  'What fields does akoya_request have?',
  'Find emails related to proposal 1002386',
];

// ─── Main Page ───

function DynamicsExplorer() {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState('');
  const [userRole, setUserRole] = useState('read_only');
  const [sessionId] = useState(() => `de-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [showAdmin, setShowAdmin] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messageIdRef = useRef(0);
  const pendingFileExportsRef = useRef([]);

  let profileContext = null;
  try {
    profileContext = useProfile();
  } catch (e) {}
  const currentProfile = profileContext?.currentProfile;

  // Fetch user role on mount
  useEffect(() => {
    const profileId = currentProfile?.id;
    if (!profileId) return;

    fetch(`/api/dynamics-explorer/roles?userProfileId=${profileId}`)
      .then(r => r.json())
      .then(data => setUserRole(data.callerRole || data.role || 'read_only'))
      .catch(() => {});
  }, [currentProfile?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingStatus]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, []);

  const sendMessage = useCallback(async (text) => {
    const messageText = text || currentMessage.trim();
    if (!messageText || isProcessing) return;

    const userMsg = { id: ++messageIdRef.current, role: 'user', content: messageText, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setCurrentMessage('');
    setIsProcessing(true);
    setThinkingStatus('Thinking...');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const resp = await fetch('/api/dynamics-explorer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          userProfileId: currentProfile?.id,
          sessionId,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      // Parse SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let streamingMsgId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const eventLines = buffer.split('\n\n');
        buffer = eventLines.pop(); // Keep incomplete event in buffer

        for (const eventBlock of eventLines) {
          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            if (line.startsWith('data: ')) eventData = line.slice(6);
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            switch (eventType) {
              case 'thinking':
                setThinkingStatus(parsed.message || 'Processing...');
                break;
              case 'file_ready':
                pendingFileExportsRef.current.push(parsed);
                break;
              case 'export_progress':
                setThinkingStatus(`Processing records ${parsed.processed} of ${parsed.total}...${parsed.failed ? ` (${parsed.failed} failed)` : ''}`);
                break;
              case 'text_delta':
                // Stream text incrementally — create or update streaming message
                if (!streamingMsgId) {
                  streamingMsgId = ++messageIdRef.current;
                  assistantContent = parsed.text || '';
                  setThinkingStatus('');
                  setMessages(prev => [...prev, {
                    id: streamingMsgId,
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: Date.now(),
                    isStreaming: true,
                  }]);
                } else {
                  assistantContent += parsed.text || '';
                  setMessages(prev => prev.map(m =>
                    m.id === streamingMsgId
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }
                break;
              case 'response':
                // Non-streamed full response (fallback)
                assistantContent = parsed.content || '';
                break;
              case 'complete': {
                const fileExports = pendingFileExportsRef.current.length > 0
                  ? [...pendingFileExportsRef.current]
                  : undefined;
                pendingFileExportsRef.current = [];

                if (streamingMsgId) {
                  // Finalize streaming message
                  setMessages(prev => prev.map(m =>
                    m.id === streamingMsgId
                      ? { ...m, content: assistantContent, isStreaming: false, rounds: parsed.rounds, fileExports }
                      : m
                  ));
                } else {
                  // Add complete assistant message (non-streamed)
                  setMessages(prev => [...prev, {
                    id: ++messageIdRef.current,
                    role: 'assistant',
                    content: assistantContent,
                    timestamp: Date.now(),
                    rounds: parsed.rounds,
                    fileExports,
                  }]);
                }
                setIsProcessing(false);
                setThinkingStatus('');
                break;
              }
              case 'error':
                setMessages(prev => [...prev, {
                  id: ++messageIdRef.current,
                  role: 'assistant',
                  content: `**Error:** ${parsed.message}`,
                  timestamp: Date.now(),
                  isError: true,
                }]);
                setIsProcessing(false);
                setThinkingStatus('');
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // If we fell through without a complete event, finalize
      if (isProcessing) {
        if (assistantContent) {
          if (streamingMsgId) {
            setMessages(prev => prev.map(m =>
              m.id === streamingMsgId
                ? { ...m, content: assistantContent, isStreaming: false }
                : m
            ));
          } else {
            setMessages(prev => [...prev, {
              id: ++messageIdRef.current,
              role: 'assistant',
              content: assistantContent,
              timestamp: Date.now(),
            }]);
          }
        }
        setIsProcessing(false);
        setThinkingStatus('');
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: ++messageIdRef.current,
        role: 'assistant',
        content: `**Error:** ${err.message}`,
        timestamp: Date.now(),
        isError: true,
      }]);
      setIsProcessing(false);
      setThinkingStatus('');
    }
  }, [currentMessage, isProcessing, messages, currentProfile?.id, sessionId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = useCallback((content) => {
    navigator.clipboard.writeText(content);
  }, []);

  const exportChat = () => {
    const md = messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return `## ${role}\n\n${m.content}\n`;
    }).join('\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dynamics-explorer-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const roleBadge = {
    superuser: { label: 'Superuser', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    read_write: { label: 'Read/Write', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    read_only: { label: 'Read Only', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  };
  const badge = roleBadge[userRole] || roleBadge.read_only;

  return (
    <Layout title="Dynamics Explorer" maxWidth="7xl">
      <PageHeader
        title="Dynamics Explorer"
        subtitle="Chat with your CRM data using natural language"
        icon="💬"
      />

      <div className="space-y-6 pb-8">
        {/* Role + Export */}
        <Card hover={false}>
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
              {badge.label}
            </span>
            {messages.length > 0 && (
              <button
                onClick={exportChat}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Export chat
              </button>
            )}
          </div>
        </Card>

        {/* Chat area */}
        <Card hover={false} padding="p-0" className="flex flex-col" style={{ height: '70vh' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && !isProcessing && (
              <WelcomeMessage
                onExampleClick={(q) => { setCurrentMessage(q); sendMessage(q); }}
              />
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onCopy={copyMessage} />
            ))}

            {/* Thinking indicator */}
            {isProcessing && thinkingStatus && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm flex-shrink-0">
                  💬
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-3 max-w-[80%]">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent" />
                    {thinkingStatus}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 p-4 bg-white rounded-b-xl">
            <div className="flex items-end gap-3">
              <textarea
                ref={textareaRef}
                value={currentMessage}
                onChange={(e) => { setCurrentMessage(e.target.value); adjustTextarea(); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your CRM data..."
                disabled={isProcessing}
                rows={1}
                className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                style={{ maxHeight: '200px' }}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!currentMessage.trim() || isProcessing}
                loading={isProcessing}
                size="md"
                className="flex-shrink-0"
              >
                Send
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Enter to send, Shift+Enter for new line
            </p>
          </div>
        </Card>

        {/* Admin panel (superuser only) */}
        {userRole === 'superuser' && (
          <Card hover={false}>
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700"
            >
              <span className={`transition-transform ${showAdmin ? 'rotate-90' : ''}`}>&#9654;</span>
              Admin Panel
            </button>
            {showAdmin && (
              <AdminPanel userProfileId={currentProfile?.id} />
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}

// ─── Welcome Message ───

function WelcomeMessage({ onExampleClick }) {
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">💬</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Dynamics Explorer</h2>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Ask questions about your CRM data in natural language. I'll query the Dynamics 365 system and present the results.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
        {EXAMPLE_QUERIES.map((q, i) => (
          <button
            key={i}
            onClick={() => onExampleClick(q)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message Bubble ───

const MessageBubble = React.memo(function MessageBubble({ message, onCopy }) {
  const isUser = message.role === 'user';
  const segments = useMemo(
    () => isUser ? [{ type: 'text', content: message.content }] : parseMarkdownTables(message.content),
    [isUser, message.content]
  );

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
        isUser ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
      }`}>
        {isUser ? '👤' : '💬'}
      </div>

      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`rounded-lg px-4 py-3 inline-block text-left ${
          isUser
            ? 'bg-blue-600 text-white'
            : message.isError
              ? 'bg-red-50 border border-red-200 text-gray-900'
              : 'bg-gray-100 text-gray-900'
        }`}>
          {segments.map((seg, i) => (
            seg.type === 'table' ? (
              <DataTable key={i} headers={seg.headers} rows={seg.rows} />
            ) : (
              <div
                key={i}
                className="text-sm leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdownText(seg.content) }}
              />
            )
          ))}
        </div>

        {/* File download buttons */}
        {message.fileExports?.map((fe, i) => (
          <FileDownloadButton key={i} fileExport={fe} />
        ))}

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <button onClick={() => onCopy(message.content)} className="hover:text-gray-600">
              Copy
            </button>
            {message.rounds && (
              <span>{message.rounds} query round{message.rounds > 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── File Download Button ───

function FileDownloadButton({ fileExport }) {
  const handleDownload = useCallback(() => {
    const bytes = Uint8Array.from(atob(fileExport.base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileExport.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileExport]);

  return (
    <div className="my-3 flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
      <div className="text-2xl flex-shrink-0">📊</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{fileExport.filename}</div>
        <div className="text-xs text-gray-500">
          {fileExport.recordCount.toLocaleString()} rows, {fileExport.columns.length} columns
          {fileExport.capped && (
            <span className="text-amber-600 ml-1">
              (capped — {fileExport.totalCount.toLocaleString()} total matched)
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex-shrink-0"
      >
        Download
      </button>
    </div>
  );
}

// ─── Data Table ───

function DataTable({ headers, rows }) {
  return (
    <div className="my-3 -mx-2">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-200 border-b border-gray-300 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-gray-700 border-b border-gray-200 whitespace-nowrap max-w-xs truncate" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end mt-1">
        <button
          onClick={() => downloadCsv(headers, rows, `dynamics-export-${Date.now()}.csv`)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── Admin Panel ───

function AdminPanel({ userProfileId }) {
  const [restrictions, setRestrictions] = useState([]);
  const [newRestriction, setNewRestriction] = useState({ table_name: '', field_name: '', reason: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dynamics-explorer/restrictions?userProfileId=${userProfileId}`)
      .then(r => r.json())
      .then(data => {
        setRestrictions(data.restrictions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userProfileId]);

  const addRestriction = async () => {
    if (!newRestriction.table_name) return;
    const resp = await fetch('/api/dynamics-explorer/restrictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newRestriction, userProfileId }),
    });
    const data = await resp.json();
    if (data.restriction) {
      setRestrictions(prev => [...prev, data.restriction]);
      setNewRestriction({ table_name: '', field_name: '', reason: '' });
    }
  };

  const removeRestriction = async (id) => {
    await fetch('/api/dynamics-explorer/restrictions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userProfileId }),
    });
    setRestrictions(prev => prev.filter(r => r.id !== id));
  };

  if (loading) return <p className="text-sm text-gray-500 mt-4">Loading admin data...</p>;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">Data Restrictions</h3>
      {restrictions.length > 0 ? (
        <div className="space-y-1 mb-3">
          {restrictions.map(r => (
            <div key={r.id} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded">
              <span>
                <span className="font-mono text-xs">{r.table_name}</span>
                {r.field_name && <span className="font-mono text-xs">.{r.field_name}</span>}
                <span className="text-gray-500 ml-2">({r.restriction_type})</span>
                {r.reason && <span className="text-gray-500 ml-1">- {r.reason}</span>}
              </span>
              <button onClick={() => removeRestriction(r.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 mb-3">No restrictions configured.</p>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <input
          placeholder="Table name"
          value={newRestriction.table_name}
          onChange={e => setNewRestriction(prev => ({ ...prev, table_name: e.target.value }))}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-40"
        />
        <input
          placeholder="Field (optional)"
          value={newRestriction.field_name}
          onChange={e => setNewRestriction(prev => ({ ...prev, field_name: e.target.value }))}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-36"
        />
        <input
          placeholder="Reason"
          value={newRestriction.reason}
          onChange={e => setNewRestriction(prev => ({ ...prev, reason: e.target.value }))}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
        />
        <button onClick={addRestriction} className="px-3 py-1 bg-gray-900 text-white text-sm rounded hover:bg-gray-800">Add</button>
      </div>
    </div>
  );
}

export default function DynamicsExplorerPage() {
  return <RequireAppAccess appKey="dynamics-explorer"><DynamicsExplorer /></RequireAppAccess>;
}
