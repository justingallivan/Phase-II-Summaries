import { useState, useEffect } from 'react';
import Layout, { PageHeader, Card } from '../shared/components/Layout';

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function formatCost(cents) {
  if (cents == null) return '$0.00';
  return '$' + (Number(cents) / 100).toFixed(2);
}

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function StatusBadge({ status }) {
  const colors = {
    ok: 'bg-green-100 text-green-800',
    healthy: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    unhealthy: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    degraded: 'bg-yellow-100 text-yellow-800',
    skipped: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.skipped}`}>
      {status}
    </span>
  );
}

// --- Section A: Service Health ---
function HealthSection() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(err => setHealth({ overall: 'error', services: {}, error: err.message }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Health</h2>
        <div className="text-gray-500 text-sm">Loading health status...</div>
      </Card>
    );
  }

  if (!health) return null;

  const serviceLabels = {
    database: 'Database',
    claude: 'Claude API',
    azureAd: 'Azure AD (SSO)',
    dynamicsCrm: 'Dynamics CRM',
    encryption: 'Encryption Key',
    nextAuthUrl: 'NEXTAUTH_URL',
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Service Health</h2>
        <StatusBadge status={health.overall} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(health.services || {}).map(([key, svc]) => (
          <div
            key={key}
            className={`p-3 rounded-lg border ${
              svc.status === 'ok' ? 'border-green-200 bg-green-50' :
              svc.status === 'error' ? 'border-red-200 bg-red-50' :
              svc.status === 'warning' ? 'border-yellow-200 bg-yellow-50' :
              'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">{serviceLabels[key] || key}</span>
              <StatusBadge status={svc.status} />
            </div>
            {svc.message && (
              <p className="text-xs text-gray-600 truncate" title={svc.message}>{svc.message}</p>
            )}
            {svc.reason && (
              <p className="text-xs text-gray-500">{svc.reason}</p>
            )}
          </div>
        ))}
      </div>
      {health.timestamp && (
        <p className="text-xs text-gray-400 mt-3">Checked at {new Date(health.timestamp).toLocaleString()}</p>
      )}
    </Card>
  );
}

// --- Section B: Usage Overview ---
function UsageSection() {
  const [period, setPeriod] = useState('30d');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/stats?period=${period}`)
      .then(r => {
        if (r.status === 403) throw new Error('Admin access required');
        if (!r.ok) throw new Error('Failed to fetch stats');
        return r.json();
      })
      .then(setStats)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  if (error) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Usage</h2>
        <div className="text-red-600 text-sm">{error}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">API Usage</h2>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === opt.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Loading usage data...</div>
        ) : stats?.summary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard label="Total Requests" value={stats.summary.total_requests} />
            <SummaryCard label="Estimated Cost" value={formatCost(stats.summary.total_cost_cents)} />
            <SummaryCard label="Active Users" value={stats.summary.unique_users} />
            <SummaryCard label="Errors" value={stats.summary.error_count} alert={stats.summary.error_count > 0} />
          </div>
        ) : (
          <div className="text-gray-500 text-sm">No usage data yet.</div>
        )}
      </Card>

      {/* Usage by User */}
      {stats?.byUser?.length > 0 && (
        <Card>
          <h3 className="text-md font-semibold text-gray-900 mb-3">Usage by User</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">User</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Requests</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Tokens</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Est. Cost</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Errors</th>
                </tr>
              </thead>
              <tbody>
                {stats.byUser.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900">{row.user_name}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.request_count}</td>
                    <td className="py-2 px-2 text-right text-gray-700">
                      {formatTokens(Number(row.total_input_tokens) + Number(row.total_output_tokens))}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-700">{formatCost(row.total_cost_cents)}</td>
                    <td className={`py-2 px-2 text-right ${row.error_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {row.error_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Usage by App */}
      {stats?.byApp?.length > 0 && (
        <Card>
          <h3 className="text-md font-semibold text-gray-900 mb-3">Usage by App</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">App</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Requests</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Tokens</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Est. Cost</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {stats.byApp.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900">{row.app_name}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.request_count}</td>
                    <td className="py-2 px-2 text-right text-gray-700">
                      {formatTokens(Number(row.total_input_tokens) + Number(row.total_output_tokens))}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-700">{formatCost(row.total_cost_cents)}</td>
                    <td className="py-2 px-2 text-right text-gray-700">
                      {row.avg_latency_ms ? `${(row.avg_latency_ms / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Daily Trend */}
      {stats?.byDay?.length > 0 && (
        <Card>
          <h3 className="text-md font-semibold text-gray-900 mb-3">Daily Trend</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">Date</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Requests</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Est. Cost</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">Users</th>
                </tr>
              </thead>
              <tbody>
                {stats.byDay.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-900">{new Date(row.day).toLocaleDateString()}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.request_count}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{formatCost(row.total_cost_cents)}</td>
                    <td className="py-2 px-2 text-right text-gray-700">{row.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, alert = false }) {
  return (
    <div className={`p-4 rounded-lg border ${alert ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

// --- Section C: Role Management ---
const ROLE_OPTIONS = [
  { value: 'superuser', label: 'Superuser' },
  { value: 'read_write', label: 'Read/Write' },
  { value: 'read_only', label: 'Read Only' },
];

function RoleManagementSection() {
  const [roles, setRoles] = useState(null);
  const [users, setUsers] = useState([]);
  const [callerRole, setCallerRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('read_only');
  const [message, setMessage] = useState(null);

  const fetchRoles = () => {
    fetch('/api/dynamics-explorer/roles')
      .then(r => {
        if (r.status === 403 || r.status === 401) {
          setCallerRole('denied');
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setCallerRole(data.callerRole);
        setRoles(data.roles || []);
      })
      .catch(() => setCallerRole('denied'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRoles();
    fetch('/api/user-profiles')
      .then(r => r.json())
      .then(data => setUsers(data.profiles || []))
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Management</h2>
        <div className="text-gray-500 text-sm">Loading...</div>
      </Card>
    );
  }

  if (callerRole !== 'superuser') return null;

  const assignRole = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/dynamics-explorer/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userProfileId: parseInt(selectedUser), role: selectedRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to assign role');
      }
      setMessage({ type: 'success', text: 'Role assigned' });
      setSelectedUser('');
      fetchRoles();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (userProfileId, userName) => {
    if (!confirm(`Remove role from ${userName}? They will revert to read-only.`)) return;
    setMessage(null);
    try {
      const res = await fetch('/api/dynamics-explorer/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userProfileId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove role');
      }
      setMessage({ type: 'success', text: `Role removed from ${userName}` });
      fetchRoles();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // Users not yet in the roles table
  const assignedIds = new Set((roles || []).map(r => r.user_profile_id));
  const availableUsers = users.filter(u => !assignedIds.has(u.id) && u.is_active);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Role Management</h2>

      {message && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Current roles */}
      {roles && roles.length > 0 ? (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-600">User</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600">Role</th>
                <th className="text-left py-2 px-2 font-medium text-gray-600">Granted By</th>
                <th className="text-right py-2 px-2 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.id} className="border-b border-gray-100">
                  <td className="py-2 px-2 text-gray-900">{role.user_name}</td>
                  <td className="py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      role.role === 'superuser' ? 'bg-purple-100 text-purple-800' :
                      role.role === 'read_write' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {role.role}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-gray-500">{role.granted_by_name || '-'}</td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => removeRole(role.user_profile_id, role.user_name)}
                      className="text-xs text-red-600 hover:text-red-800 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-6">No roles assigned yet.</p>
      )}

      {/* Assign role form */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
          <select
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
          >
            <option value="">Select user...</option>
            {availableUsers.map(u => (
              <option key={u.id} value={u.id}>{u.name}{u.azure_email ? ` (${u.azure_email})` : ''}</option>
            ))}
            {/* Also allow re-assigning existing users to change their role */}
            {roles && roles.length > 0 && (
              <optgroup label="Change existing role">
                {roles.map(r => (
                  <option key={`existing-${r.user_profile_id}`} value={r.user_profile_id}>
                    {r.user_name} (currently {r.role})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
          >
            {ROLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={assignRole}
          disabled={!selectedUser || saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Assigning...' : 'Assign'}
        </button>
      </div>
    </Card>
  );
}

// --- Section D: Quick Links ---
function QuickLinksSection() {
  const links = [
    { name: 'Vercel Dashboard', url: 'https://vercel.com/dashboard', description: 'Deployments, logs, environment' },
    { name: 'Anthropic Console', url: 'https://console.anthropic.com', description: 'API billing and usage' },
    { name: 'Credentials Runbook', url: '/docs/CREDENTIALS_RUNBOOK.md', description: 'Secret rotation, diagnostics', internal: true },
  ];

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Links</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {links.map(link => (
          <a
            key={link.name}
            href={link.url}
            target={link.internal ? undefined : '_blank'}
            rel={link.internal ? undefined : 'noopener noreferrer'}
            className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <div className="text-sm font-medium text-gray-900">{link.name}</div>
            <div className="text-xs text-gray-500 mt-1">{link.description}</div>
          </a>
        ))}
      </div>
    </Card>
  );
}

// --- Main Page ---
export default function AdminDashboard() {
  return (
    <Layout title="Admin Dashboard" description="System administration and usage analytics">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Service health, API usage analytics, and system administration"
      />

      <div className="py-8 space-y-6">
        <HealthSection />
        <UsageSection />
        <RoleManagementSection />
        <QuickLinksSection />
      </div>
    </Layout>
  );
}
