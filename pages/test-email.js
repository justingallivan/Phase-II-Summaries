import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Layout, { PageHeader, Card, Button } from '../shared/components/Layout';

export default function TestEmail() {
  const { data: session } = useSession();
  const sessionEmail = session?.user?.azureEmail || '';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('[TEST] Dynamics Email Integration');
  const [body, setBody] = useState('<p>This is a <strong>test email</strong> sent via the Dynamics 365 Email Activities API.</p><p>If you received this, the integration is working correctly.</p>');
  const [sendMode, setSendMode] = useState('draft');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const senderEmail = sessionEmail || from;

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    setError(null);

    try {
      const resp = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, sendMode, from: senderEmail }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || `Request failed (${resp.status})`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Layout title="Email Test Client">
      <PageHeader
        title="Dynamics Email Test Client"
        description="Test the Dynamics 365 email integration. Creates email activities via the CRM API."
      />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            {sessionEmail ? (
              <>
                <input
                  type="email"
                  value={sessionEmail}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">Sender is your authenticated email</p>
              </>
            ) : (
              <>
                <input
                  type="email"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                  placeholder="sender@wmkeck.org"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">No session detected — enter sender manually (dev mode)</p>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="recipient@wmkeck.org"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  value="draft"
                  checked={sendMode === 'draft'}
                  onChange={e => setSendMode(e.target.value)}
                  className="text-blue-600"
                />
                <span className="text-sm">Create draft only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sendMode"
                  value="send"
                  checked={sendMode === 'send'}
                  onChange={e => setSendMode(e.target.value)}
                  className="text-blue-600"
                />
                <span className="text-sm">Create and send</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={sending || !to || !senderEmail}
            >
              {sending ? 'Processing...' : sendMode === 'send' ? 'Send Email' : 'Create Draft'}
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <Card className="mt-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h3 className="text-red-800 font-medium mb-1">Error</h3>
            <p className="text-red-700 text-sm font-mono whitespace-pre-wrap">{error}</p>
          </div>
        </Card>
      )}

      {result && (
        <Card className="mt-4">
          <div className={`border rounded-md p-4 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h3 className={`font-medium mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? 'Success' : 'Failed'}
            </h3>
            <p className="text-sm mb-2">{result.message}</p>
            {result.emailId && (
              <p className="text-xs text-gray-600 font-mono">Activity ID: {result.emailId}</p>
            )}
            {result.status && (
              <p className="text-xs text-gray-600 mt-1">Status: {result.status}</p>
            )}
          </div>
        </Card>
      )}
    </Layout>
  );
}
