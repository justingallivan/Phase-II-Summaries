/**
 * ApiSettingsPanel - Collapsible panel for optional API keys
 *
 * Used for enrichment features that require additional API credentials:
 * - ORCID (free, for contact lookups)
 * - NCBI (free, for faster PubMed queries)
 * - SerpAPI (paid, for Google searches)
 *
 * Now integrates with user profiles for secure storage.
 * Keys are stored in the database when a profile is selected,
 * or in localStorage as fallback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useProfile } from '../context/ProfileContext';

// Storage keys for localStorage (fallback)
const STORAGE_KEYS = {
  ORCID_CLIENT_ID: 'orcid_client_id_encrypted',
  ORCID_CLIENT_SECRET: 'orcid_client_secret_encrypted',
  NCBI_API_KEY: 'ncbi_api_key_encrypted',
  SERP_API_KEY: 'serp_api_key_encrypted',
};

// Preference keys for profile storage
const PREFERENCE_KEYS = {
  ORCID_CLIENT_ID: 'api_key_orcid_client_id',
  ORCID_CLIENT_SECRET: 'api_key_orcid_client_secret',
  NCBI_API_KEY: 'api_key_ncbi',
  SERP_API_KEY: 'api_key_serp',
};

// Track which profiles have been prompted for migration this session
const migratedProfiles = new Set();

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
                Get credentials
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
    serpApiKey: '',
  });
  const [hasStoredSettings, setHasStoredSettings] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved', 'error', null
  const [isLoading, setIsLoading] = useState(true);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

  // Get profile context
  let profileContext = null;
  try {
    profileContext = useProfile();
  } catch (e) {
    // ProfileProvider not available
  }

  const { currentProfile, getDecryptedApiKey, hasPreference } = profileContext || {};

  // Track the last loaded profile to avoid duplicate loads
  const lastLoadedProfileId = useRef(null);
  const isLoadingRef = useRef(false);

  // Load settings from profile or localStorage
  const loadSettings = useCallback(async (profileId) => {
    // Prevent concurrent loads and duplicate loads for same profile
    if (isLoadingRef.current) return;
    if (profileId === lastLoadedProfileId.current && lastLoadedProfileId.current !== null) return;

    isLoadingRef.current = true;
    lastLoadedProfileId.current = profileId;
    setIsLoading(true);
    setShowMigrationPrompt(false);

    const loaded = {
      orcidClientId: '',
      orcidClientSecret: '',
      ncbiApiKey: '',
      serpApiKey: '',
    };

    // If profile is selected, ONLY use profile storage (not localStorage)
    if (profileId && getDecryptedApiKey) {
      try {
        const [orcidId, orcidSecret, ncbi, serp] = await Promise.all([
          getDecryptedApiKey(PREFERENCE_KEYS.ORCID_CLIENT_ID),
          getDecryptedApiKey(PREFERENCE_KEYS.ORCID_CLIENT_SECRET),
          getDecryptedApiKey(PREFERENCE_KEYS.NCBI_API_KEY),
          getDecryptedApiKey(PREFERENCE_KEYS.SERP_API_KEY),
        ]);

        if (orcidId) { loaded.orcidClientId = orcidId; }
        if (orcidSecret) { loaded.orcidClientSecret = orcidSecret; }
        if (ncbi) { loaded.ncbiApiKey = ncbi; }
        if (serp) { loaded.serpApiKey = serp; }
      } catch (err) {
        console.error('Error loading settings from profile:', err);
      }

      // Check if localStorage has keys to migrate (don't auto-fill, just prompt)
      const stored = {
        orcidClientId: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_ID),
        orcidClientSecret: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_SECRET),
        ncbiApiKey: localStorage.getItem(STORAGE_KEYS.NCBI_API_KEY),
        serpApiKey: localStorage.getItem(STORAGE_KEYS.SERP_API_KEY),
      };
      const hasLocalStorage = Object.values(stored).some(v => v);
      const hasProfile = Object.values(loaded).some(v => v);

      if (hasLocalStorage && !hasProfile && !migratedProfiles.has(profileId)) {
        setShowMigrationPrompt(true);
      }

      setSettings(loaded);
      const hasAny = Object.values(loaded).some(v => v && v.length > 0);
      setHasStoredSettings(hasAny);

      if (onSettingsChange) {
        onSettingsChange(loaded);
      }

      setIsLoading(false);
      isLoadingRef.current = false;
      return;
    }

    // No profile selected - use localStorage
    const stored = {
      orcidClientId: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_ID),
      orcidClientSecret: localStorage.getItem(STORAGE_KEYS.ORCID_CLIENT_SECRET),
      ncbiApiKey: localStorage.getItem(STORAGE_KEYS.NCBI_API_KEY),
      serpApiKey: localStorage.getItem(STORAGE_KEYS.SERP_API_KEY),
    };

    if (stored.orcidClientId) { loaded.orcidClientId = atob(stored.orcidClientId); }
    if (stored.orcidClientSecret) { loaded.orcidClientSecret = atob(stored.orcidClientSecret); }
    if (stored.ncbiApiKey) { loaded.ncbiApiKey = atob(stored.ncbiApiKey); }
    if (stored.serpApiKey) { loaded.serpApiKey = atob(stored.serpApiKey); }

    setSettings(loaded);

    const hasAny = Object.values(loaded).some(v => v && v.length > 0);
    setHasStoredSettings(hasAny);

    if (onSettingsChange) {
      onSettingsChange(loaded);
    }

    setIsLoading(false);
    isLoadingRef.current = false;
  }, [getDecryptedApiKey, onSettingsChange]);

  // Load on mount and when profile changes
  useEffect(() => {
    const profileId = currentProfile?.id || null;
    loadSettings(profileId);
  }, [currentProfile?.id, loadSettings]);

  // Update a single setting
  const updateSetting = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaveStatus(null);
  };

  // Save all settings
  const saveSettings = async () => {
    try {
      // Save to profile if available
      if (currentProfile) {
        const response = await fetch('/api/user-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: currentProfile.id,
            preferences: {
              [PREFERENCE_KEYS.ORCID_CLIENT_ID]: settings.orcidClientId || null,
              [PREFERENCE_KEYS.ORCID_CLIENT_SECRET]: settings.orcidClientSecret || null,
              [PREFERENCE_KEYS.NCBI_API_KEY]: settings.ncbiApiKey || null,
              [PREFERENCE_KEYS.SERP_API_KEY]: settings.serpApiKey || null,
            }
          })
        });

        if (!response.ok) {
          throw new Error('Failed to save to profile');
        }
      }

      // Also save to localStorage as fallback
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

      if (settings.serpApiKey) {
        localStorage.setItem(STORAGE_KEYS.SERP_API_KEY, btoa(settings.serpApiKey));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SERP_API_KEY);
      }

      const hasAny = Object.values(settings).some(v => v && v.length > 0);
      setHasStoredSettings(hasAny);
      setSaveStatus('saved');
      setShowMigrationPrompt(false);

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

  // Migrate localStorage settings to profile
  const migrateToProfile = async () => {
    if (!currentProfile) return;

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfile.id,
          preferences: {
            [PREFERENCE_KEYS.ORCID_CLIENT_ID]: settings.orcidClientId || null,
            [PREFERENCE_KEYS.ORCID_CLIENT_SECRET]: settings.orcidClientSecret || null,
            [PREFERENCE_KEYS.NCBI_API_KEY]: settings.ncbiApiKey || null,
            [PREFERENCE_KEYS.SERP_API_KEY]: settings.serpApiKey || null,
          }
        })
      });

      if (response.ok) {
        migratedProfiles.add(currentProfile.id);
        setShowMigrationPrompt(false);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (error) {
      console.error('Migration error:', error);
    }
  };

  // Skip migration for this profile
  const skipMigration = () => {
    if (currentProfile) {
      migratedProfiles.add(currentProfile.id);
    }
    setShowMigrationPrompt(false);
  };

  // Clear all settings
  const clearSettings = async () => {
    if (!confirm('Are you sure you want to remove all stored API keys?')) {
      return;
    }

    // Clear from localStorage
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });

    // Clear from profile if available
    if (currentProfile) {
      try {
        await fetch('/api/user-preferences', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: currentProfile.id,
            keys: Object.values(PREFERENCE_KEYS)
          })
        });
      } catch (error) {
        console.error('Error clearing profile settings:', error);
      }
    }

    const emptySettings = {
      orcidClientId: '',
      orcidClientSecret: '',
      ncbiApiKey: '',
      serpApiKey: '',
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
  if (settings.serpApiKey) {
    configuredApis.push('SerpAPI');
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
          {currentProfile && (
            <span className="text-xs text-gray-500" title={`Profile: ${currentProfile.displayName || currentProfile.name}`}>
              👤
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
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-4">Loading settings...</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Optional API keys for enhanced features.
                {currentProfile
                  ? ` Saved securely to your profile (${currentProfile.displayName || currentProfile.name}).`
                  : ' Stored locally in your browser.'}
              </p>

              {/* Migration prompt */}
              {showMigrationPrompt && currentProfile && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 mb-2">
                    Migrate your API keys to your profile for secure database storage?
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={skipMigration}
                      className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-100 rounded"
                    >
                      Skip
                    </button>
                    <button
                      onClick={migrateToProfile}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Migrate
                    </button>
                  </div>
                </div>
              )}

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
              <div className="mb-6 pb-6 border-b border-gray-100">
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

              {/* SerpAPI Section */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="text-blue-600">🔍</span>
                  SerpAPI Key
                  <span className="text-xs font-normal text-gray-500">(Paid - ~$0.005/search)</span>
                </h4>

                <ApiKeyField
                  label="API Key"
                  value={settings.serpApiKey}
                  onChange={(v) => updateSetting('serpApiKey', v)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  helpText="Enables Google Search for faculty pages and contact info (Tier 4)."
                  helpUrl="https://serpapi.com/manage-api-key"
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
                  <strong>🔒 Privacy:</strong> All credentials are
                  {currentProfile
                    ? ' encrypted and stored securely in the database, associated with your profile.'
                    : ' stored locally in your browser using base64 encoding.'}
                  They are never sent to our servers - only directly to the respective API providers.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Export storage keys for use by services
export { STORAGE_KEYS, PREFERENCE_KEYS };
