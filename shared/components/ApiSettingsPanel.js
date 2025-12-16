/**
 * ApiSettingsPanel - Collapsible panel for optional API keys
 *
 * Used for enrichment features that require additional API credentials:
 * - ORCID (free, for contact lookups)
 * - NCBI (free, for faster PubMed queries)
 *
 * Follows the same patterns as other shared components in this suite.
 * Keys are stored in localStorage with base64 encoding (same as ApiKeyManager).
 */

import { useState, useEffect } from 'react';

// Storage keys for each API credential
const STORAGE_KEYS = {
  ORCID_CLIENT_ID: 'orcid_client_id_encrypted',
  ORCID_CLIENT_SECRET: 'orcid_client_secret_encrypted',
  NCBI_API_KEY: 'ncbi_api_key_encrypted',
};

// Helper to mask sensitive values
const maskValue = (value) => {
  if (!value || value.length < 6) return '••••••••';
  return `${value.substring(0, 3)}••••${value.substring(value.length - 3)}`;
};

// Single API key input field component
function ApiKeyField({
  label,
  value,
  onChange,
  placeholder,
  helpText,
  helpUrl,
  type = 'password'
}) {
  const [showValue, setShowValue] = useState(false);

  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type={showValue ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     placeholder-gray-400"
        />
        <button
          type="button"
          onClick={() => setShowValue(!showValue)}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={showValue ? 'Hide value' : 'Show value'}
        >
          {showValue ? '👁️‍🗨️' : '👁️'}
        </button>
      </div>
      {helpText && (
        <p className="mt-1 text-xs text-gray-500">
          {helpText}
          {helpUrl && (
            <>
              {' '}
              <a
                href={helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Get credentials →
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default function ApiSettingsPanel({ onSettingsChange }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [settings, setSettings] = useState({
    orcidClientId: '',
    orcidClientSecret: '',
    ncbiApiKey: '',
  });
  const [hasStoredSettings, setHasStoredSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved', 'error', null

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = {
      orcidClientId: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_ID),
      orcidClientSecret: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_SECRET),
      ncbiApiKey: localStorage.getItem(STORAGE_KEYS.NCBI_API_KEY),
    };

    const decoded = {
      orcidClientId: stored.orcidClientId ? atob(stored.orcidClientId) : '',
      orcidClientSecret: stored.orcidClientSecret ? atob(stored.orcidClientSecret) : '',
      ncbiApiKey: stored.ncbiApiKey ? atob(stored.ncbiApiKey) : '',
    };

    setSettings(decoded);

    const hasAny = Object.values(decoded).some(v => v && v.length > 0);
    setHasStoredSettings(hasAny);

    // Notify parent of initial settings
    if (onSettingsChange) {
      onSettingsChange(decoded);
    }
  }, []);

  // Update a single setting
  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaveStatus(null); // Clear save status when editing
  };

  // Save all settings to localStorage
  const saveSettings = () => {
    try {
      // Encode and store each setting
      if (settings.orcidClientId) {
        localStorage.setItem(STORAGE_KEYS.ORCID_CLIENT_ID, btoa(settings.orcidClientId));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ORCID_CLIENT_ID);
      }

      if (settings.orcidClientSecret) {
        localStorage.setItem(STORAGE_KEYS.ORCID_CLIENT_SECRET, btoa(settings.orcidClientSecret));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ORCID_CLIENT_SECRET);
      }

      if (settings.ncbiApiKey) {
        localStorage.setItem(STORAGE_KEYS.NCBI_API_KEY, btoa(settings.ncbiApiKey));
      } else {
        localStorage.removeItem(STORAGE_KEYS.NCBI_API_KEY);
      }

      const hasAny = Object.values(settings).some(v => v && v.length > 0);
      setHasStoredSettings(hasAny);
      setSaveStatus('saved');

      // Notify parent of updated settings
      if (onSettingsChange) {
        onSettingsChange(settings);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Failed to save API settings:', error);
      setSaveStatus('error');
    }
  };

  // Clear all settings
  const clearSettings = () => {
    if (!confirm('Are you sure you want to remove all stored API keys?')) {
      return;
    }

    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });

    const emptySettings = {
      orcidClientId: '',
      orcidClientSecret: '',
      ncbiApiKey: '',
    };

    setSettings(emptySettings);
    setHasStoredSettings(false);
    setSaveStatus(null);

    if (onSettingsChange) {
      onSettingsChange(emptySettings);
    }
  };

  // Summary of configured APIs
  const configuredApis = [];
  if (settings.orcidClientId && settings.orcidClientSecret) {
    configuredApis.push('ORCID');
  }
  if (settings.ncbiApiKey) {
    configuredApis.push('NCBI');
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50
                   hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500">⚙️</span>
          <span className="font-medium text-gray-700">API Settings</span>
          {hasStoredSettings && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {configuredApis.length} configured
            </span>
          )}
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 bg-white">
          <p className="text-sm text-gray-600 mb-4">
            Optional API keys for enhanced features. These are stored locally in your browser.
          </p>

          {/* ORCID Section */}
          <div className="mb-6 pb-6 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-green-600">🔗</span>
              ORCID API
              <span className="text-xs font-normal text-gray-500">(Free - for contact lookups)</span>
            </h4>

            <ApiKeyField
              label="Client ID"
              value={settings.orcidClientId}
              onChange={(v) => updateSetting('orcidClientId', v)}
              placeholder="APP-XXXXXXXXXXXXXXXX"
              helpText="Your ORCID public API client ID."
              helpUrl="https://info.orcid.org/documentation/integration-guide/registering-a-public-api-client/"
            />

            <ApiKeyField
              label="Client Secret"
              value={settings.orcidClientSecret}
              onChange={(v) => updateSetting('orcidClientSecret', v)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              helpText="Your ORCID public API client secret."
            />
          </div>

          {/* NCBI Section */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="text-blue-600">🔬</span>
              NCBI API Key
              <span className="text-xs font-normal text-gray-500">(Free - for faster PubMed)</span>
            </h4>

            <ApiKeyField
              label="API Key"
              value={settings.ncbiApiKey}
              onChange={(v) => updateSetting('ncbiApiKey', v)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              helpText="Increases PubMed rate limit from 3 to 10 requests/second."
              helpUrl="https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/"
            />
          </div>

          {/* Status Message */}
          {saveStatus === 'saved' && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <span>✓</span>
              Settings saved successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <span>✗</span>
              Failed to save settings
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              onClick={clearSettings}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors"
              disabled={!hasStoredSettings}
            >
              Clear All
            </button>
            <button
              onClick={saveSettings}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                       hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Settings
            </button>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">
              <strong>🔒 Privacy:</strong> All credentials are stored locally in your browser
              using base64 encoding. They are never sent to our servers - only directly to
              the respective API providers (ORCID, NCBI) when making requests.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Export storage keys for use by services
export { STORAGE_KEYS };
