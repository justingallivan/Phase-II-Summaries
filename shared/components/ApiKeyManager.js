import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ApiKeyManager.module.css';
import { getModelDisplayName } from '../utils/modelNames';
import { BASE_CONFIG } from '../config/baseConfig';
import { useProfile } from '../context/ProfileContext';

const API_KEY_STORAGE_KEY = 'claude_api_key_encrypted';
const PREFERENCE_KEY = 'api_key_claude';

// Track which profiles have been prompted for migration this session
const migratedProfiles = new Set();

/**
 * Get the model for a specific app (client-side version)
 * This mirrors the server-side getModelForApp but runs in the browser
 */
function getModelForAppClient(appKey) {
  if (!appKey) return BASE_CONFIG.CLAUDE.DEFAULT_MODEL;

  const appConfig = BASE_CONFIG.APP_MODELS?.[appKey];
  if (appConfig) {
    return appConfig.model || BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
  }

  return BASE_CONFIG.CLAUDE.DEFAULT_MODEL;
}

export default function ApiKeyManager({ onApiKeySet, required = true, appKey = null }) {
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isKeyStored, setIsKeyStored] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get profile context - may be null if ProfileProvider is not mounted
  let profileContext = null;
  try {
    profileContext = useProfile();
  } catch (e) {
    // ProfileProvider not available, will use localStorage fallback
  }

  const { currentProfile, setPreference, getDecryptedApiKey, hasPreference } = profileContext || {};

  const maskApiKeyValue = (key) => {
    if (!key || key.length < 8) return '••••••••';
    return `${key.substring(0, 3)}••••••${key.substring(key.length - 3)}`;
  };

  // Track the last loaded profile to avoid duplicate loads
  const lastLoadedProfileId = useRef(null);
  const isLoadingRef = useRef(false);

  // Load API key from profile or localStorage
  const loadApiKey = useCallback(async (profileId) => {
    // Prevent concurrent loads and duplicate loads for same profile
    if (isLoadingRef.current) return;
    if (profileId === lastLoadedProfileId.current && lastLoadedProfileId.current !== null) return;

    isLoadingRef.current = true;
    lastLoadedProfileId.current = profileId;
    setIsLoading(true);

    try {
      // If profile is selected, try to get key from profile first
      if (profileId && getDecryptedApiKey) {
        try {
          const key = await getDecryptedApiKey(PREFERENCE_KEY);
          if (key) {
            setApiKey(key);
            setMaskedKey(maskApiKeyValue(key));
            setIsKeyStored(true);
            onApiKeySet(key);
            setShowMigrationPrompt(false);
            setIsLoading(false);
            isLoadingRef.current = false;
            return;
          }
        } catch (e) {
          // Profile doesn't have key, continue to localStorage
        }
      }

      // Fallback to localStorage
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        const decrypted = atob(storedKey);
        setApiKey(decrypted);
        setMaskedKey(maskApiKeyValue(decrypted));
        setIsKeyStored(true);
        onApiKeySet(decrypted);

        // If we have a profile and localStorage key, prompt to migrate (once per profile per session)
        if (profileId && !migratedProfiles.has(profileId)) {
          setShowMigrationPrompt(true);
        }
      } else if (required) {
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error loading API key:', error);
      // Try localStorage as final fallback
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        const decrypted = atob(storedKey);
        setApiKey(decrypted);
        setMaskedKey(maskApiKeyValue(decrypted));
        setIsKeyStored(true);
        onApiKeySet(decrypted);
      } else if (required) {
        setShowModal(true);
      }
    }

    setIsLoading(false);
    isLoadingRef.current = false;
  }, [getDecryptedApiKey, onApiKeySet, required]);

  // Reload when profile changes
  useEffect(() => {
    const profileId = currentProfile?.id || null;
    loadApiKey(profileId);
  }, [currentProfile?.id, loadApiKey]);

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      alert('Please enter a valid API key');
      return;
    }

    try {
      // If profile is selected, save to profile preferences
      if (currentProfile && setPreference) {
        const success = await setPreference(PREFERENCE_KEY, apiKey.trim());
        if (!success) {
          throw new Error('Failed to save to profile');
        }
      }

      // Also save to localStorage as fallback
      const encrypted = btoa(apiKey.trim());
      localStorage.setItem(API_KEY_STORAGE_KEY, encrypted);

      setMaskedKey(maskApiKeyValue(apiKey.trim()));
      setIsKeyStored(true);
      setShowModal(false);
      setShowMigrationPrompt(false);
      onApiKeySet(apiKey.trim());
    } catch (error) {
      console.error('Error saving API key:', error);
      // Fall back to localStorage only
      const encrypted = btoa(apiKey.trim());
      localStorage.setItem(API_KEY_STORAGE_KEY, encrypted);
      setMaskedKey(maskApiKeyValue(apiKey.trim()));
      setIsKeyStored(true);
      setShowModal(false);
      onApiKeySet(apiKey.trim());
    }
  };

  const migrateToProfile = async () => {
    if (!currentProfile || !setPreference) return;

    setIsMigrating(true);
    try {
      // Get key from localStorage
      const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        const decrypted = atob(storedKey);
        const success = await setPreference(PREFERENCE_KEY, decrypted);
        if (success) {
          migratedProfiles.add(currentProfile.id);
          setShowMigrationPrompt(false);
        }
      }
    } catch (error) {
      console.error('Migration error:', error);
    }
    setIsMigrating(false);
  };

  const skipMigration = () => {
    if (currentProfile) {
      migratedProfiles.add(currentProfile.id);
    }
    setShowMigrationPrompt(false);
  };

  const clearApiKey = async () => {
    if (confirm('Are you sure you want to remove your stored API key?')) {
      // Clear from localStorage
      localStorage.removeItem(API_KEY_STORAGE_KEY);

      // Clear from profile if available
      if (currentProfile) {
        try {
          await fetch('/api/user-preferences', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileId: currentProfile.id,
              key: PREFERENCE_KEY
            })
          });
        } catch (error) {
          console.error('Error clearing profile preference:', error);
        }
      }

      setApiKey('');
      setMaskedKey('');
      setIsKeyStored(false);
      setShowModal(true);
      onApiKeySet('');
    }
  };

  // Get current model info if appKey is provided
  const currentModel = appKey ? getModelForAppClient(appKey) : null;
  const modelDisplayName = currentModel ? getModelDisplayName(currentModel) : null;

  if (isLoading) {
    return (
      <div className={styles.apiKeyStatus}>
        <span className={styles.statusIcon}>⏳</span>
        <span className={styles.statusText}>Loading...</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.apiKeyStatus}>
        {isKeyStored ? (
          <div className={styles.keyStored}>
            <span className={styles.statusIcon}>🔑</span>
            <span className={styles.statusText}>
              API Key: {showKey ? apiKey : maskedKey}
            </span>
            <button
              onClick={() => setShowKey(!showKey)}
              className={styles.toggleButton}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? '👁️‍🗨️' : '👁️'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className={styles.editButton}
            >
              Edit
            </button>
            <button
              onClick={clearApiKey}
              className={styles.clearButton}
            >
              Clear
            </button>
            {currentProfile && (
              <span className={styles.profileBadge} title={`Saved to profile: ${currentProfile.displayName || currentProfile.name}`}>
                👤
              </span>
            )}
          </div>
        ) : (
          <div className={styles.keyMissing}>
            <span className={styles.statusIcon}>⚠️</span>
            <span className={styles.statusText}>API key required</span>
            <button
              onClick={() => setShowModal(true)}
              className={styles.addButton}
            >
              Add Key
            </button>
          </div>
        )}

        {/* Model indicator - shown when appKey is provided */}
        {appKey && modelDisplayName && (
          <div className={styles.modelIndicator}>
            <span className={styles.modelIcon}>🤖</span>
            <span className={styles.modelText}>
              Model: <strong>{modelDisplayName}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Migration prompt */}
      {showMigrationPrompt && currentProfile && (
        <div className={styles.migrationPrompt}>
          <p>
            Migrate your API key to your profile ({currentProfile.displayName || currentProfile.name})?
            This will save it securely in the database.
          </p>
          <div className={styles.migrationButtons}>
            <button
              onClick={skipMigration}
              className={styles.migrationSkip}
            >
              Skip
            </button>
            <button
              onClick={migrateToProfile}
              className={styles.migrationConfirm}
              disabled={isMigrating}
            >
              {isMigrating ? 'Migrating...' : 'Migrate'}
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Claude API Key</h2>
              <button
                onClick={() => setShowModal(false)}
                className={styles.closeButton}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalContent}>
              <p className={styles.instructions}>
                Enter your Claude API key to use the application.
                {currentProfile ? (
                  <> Your key will be saved to your profile ({currentProfile.displayName || currentProfile.name}) and encrypted in the database.</>
                ) : (
                  <> Your key will be stored locally in your browser.</>
                )}
              </p>

              <div className={styles.inputGroup}>
                <label htmlFor="api-key-input" className={styles.label}>
                  API Key
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className={styles.input}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className={styles.toggleInputButton}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showKey ? '👁️‍🗨️' : '👁️'}
                  </button>
                </div>
              </div>

              <div className={styles.helpText}>
                <p>
                  🔒 Your API key is encrypted and {currentProfile ? 'stored securely in your profile' : 'stored locally in your browser'}.
                  It is never sent to our servers.
                </p>
                <p>
                  📚 Need an API key? Visit{' '}
                  <a
                    href="https://console.anthropic.com/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    Anthropic Console
                  </a>
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                onClick={() => setShowModal(false)}
                className={styles.cancelButton}
              >
                Cancel
              </button>
              <button
                onClick={saveApiKey}
                className={styles.saveButton}
                disabled={!apiKey.trim()}
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
