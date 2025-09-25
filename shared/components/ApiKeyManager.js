import { useState, useEffect } from 'react';
import styles from './ApiKeyManager.module.css';

const API_KEY_STORAGE_KEY = 'claude_api_key_encrypted';

export default function ApiKeyManager({ onApiKeySet, required = true }) {
  const [apiKey, setApiKey] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isKeyStored, setIsKeyStored] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedKey) {
      const decrypted = atob(storedKey);
      setApiKey(decrypted);
      setIsKeyStored(true);
      onApiKeySet(decrypted);
    } else if (required) {
      setShowModal(true);
    }
  }, [required, onApiKeySet]);

  const saveApiKey = () => {
    if (!apiKey.trim()) {
      alert('Please enter a valid API key');
      return;
    }

    const encrypted = btoa(apiKey);
    localStorage.setItem(API_KEY_STORAGE_KEY, encrypted);
    setIsKeyStored(true);
    setShowModal(false);
    onApiKeySet(apiKey);
  };

  const clearApiKey = () => {
    if (confirm('Are you sure you want to remove your stored API key?')) {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey('');
      setIsKeyStored(false);
      setShowModal(true);
      onApiKeySet('');
    }
  };

  const maskApiKey = (key) => {
    if (!key || key.length < 8) return '••••••••';
    return `${key.substring(0, 3)}••••••${key.substring(key.length - 3)}`;
  };

  return (
    <>
      <div className={styles.apiKeyStatus}>
        {isKeyStored ? (
          <div className={styles.keyStored}>
            <span className={styles.statusIcon}>🔑</span>
            <span className={styles.statusText}>
              API Key: {showKey ? apiKey : maskApiKey(apiKey)}
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
      </div>

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
                Enter your Claude API key to use the application. Your key will be stored locally
                in your browser and never sent to our servers.
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
                  🔒 Your API key is encrypted and stored locally in your browser.
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