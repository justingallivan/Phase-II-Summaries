/**
 * ProfileContext - Global user profile state management
 *
 * Provides profile selection and preference management across the app.
 * Stores selected profile ID in localStorage for persistence.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ProfileContext = createContext(null);

// localStorage key for persisting selected profile
const SELECTED_PROFILE_KEY = 'selected_user_profile_id';

export function ProfileProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetch all profiles from the API
   */
  const refreshProfiles = useCallback(async () => {
    try {
      const response = await fetch('/api/user-profiles');
      if (!response.ok) {
        throw new Error('Failed to fetch profiles');
      }
      const data = await response.json();
      setProfiles(data.profiles || []);
      return data.profiles || [];
    } catch (err) {
      console.error('Failed to load profiles:', err);
      setError(err.message);
      return [];
    }
  }, []);

  /**
   * Fetch preferences for a profile
   */
  const refreshPreferences = useCallback(async (profileId) => {
    if (!profileId) {
      setPreferences({});
      return {};
    }

    try {
      const response = await fetch(`/api/user-preferences?profileId=${profileId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }
      const data = await response.json();
      setPreferences(data.preferences || {});
      return data.preferences || {};
    } catch (err) {
      console.error('Failed to load preferences:', err);
      return {};
    }
  }, []);

  /**
   * Select a profile by ID
   */
  const selectProfile = useCallback(async (profileId) => {
    if (!profileId) {
      setCurrentProfile(null);
      setPreferences({});
      localStorage.removeItem(SELECTED_PROFILE_KEY);
      return;
    }

    // Find profile in the list
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setCurrentProfile(profile);
      localStorage.setItem(SELECTED_PROFILE_KEY, String(profileId));

      // Update last_used_at on the server
      try {
        await fetch('/api/user-profiles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: profileId, updateLastUsed: true })
        });
      } catch (err) {
        console.error('Failed to update last_used_at:', err);
      }

      // Load preferences for this profile
      await refreshPreferences(profileId);
    }
  }, [profiles, refreshPreferences]);

  /**
   * Create a new profile
   */
  const createProfile = useCallback(async ({ name, displayName, avatarColor, isDefault }) => {
    try {
      const response = await fetch('/api/user-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, displayName, avatarColor, isDefault })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create profile');
      }

      const data = await response.json();

      // Refresh profiles list
      await refreshProfiles();

      // If this is the first profile or it's set as default, select it
      if (isDefault || profiles.length === 0) {
        await selectProfile(data.profile.id);
      }

      return data.profile;
    } catch (err) {
      console.error('Failed to create profile:', err);
      throw err;
    }
  }, [profiles.length, refreshProfiles, selectProfile]);

  /**
   * Update a profile
   */
  const updateProfile = useCallback(async (id, updates) => {
    try {
      const response = await fetch('/api/user-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const data = await response.json();

      // Refresh profiles and update current if needed
      await refreshProfiles();
      if (currentProfile?.id === id) {
        setCurrentProfile(data.profile);
      }

      return data.profile;
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err;
    }
  }, [currentProfile?.id, refreshProfiles]);

  /**
   * Archive (soft delete) a profile
   */
  const archiveProfile = useCallback(async (id) => {
    try {
      const response = await fetch('/api/user-profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to archive profile');
      }

      // Refresh profiles
      const updatedProfiles = await refreshProfiles();

      // If we archived the current profile, switch to default or first available
      if (currentProfile?.id === id) {
        const defaultProfile = updatedProfiles.find(p => p.isDefault);
        const nextProfile = defaultProfile || updatedProfiles[0];
        if (nextProfile) {
          await selectProfile(nextProfile.id);
        } else {
          setCurrentProfile(null);
          setPreferences({});
          localStorage.removeItem(SELECTED_PROFILE_KEY);
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to archive profile:', err);
      throw err;
    }
  }, [currentProfile?.id, refreshProfiles, selectProfile]);

  /**
   * Save a preference for the current profile
   */
  const setPreference = useCallback(async (key, value) => {
    if (!currentProfile) {
      console.warn('No profile selected, cannot save preference');
      return false;
    }

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfile.id,
          key,
          value
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save preference');
      }

      // Update local state
      setPreferences(prev => ({ ...prev, [key]: value }));
      return true;
    } catch (err) {
      console.error('Failed to save preference:', err);
      return false;
    }
  }, [currentProfile]);

  /**
   * Save multiple preferences at once
   */
  const savePreferences = useCallback(async (prefsToSave) => {
    if (!currentProfile) {
      console.warn('No profile selected, cannot save preferences');
      return false;
    }

    try {
      const response = await fetch('/api/user-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfile.id,
          preferences: prefsToSave
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save preferences');
      }

      // Refresh preferences from server to get properly masked values
      await refreshPreferences(currentProfile.id);
      return true;
    } catch (err) {
      console.error('Failed to save preferences:', err);
      return false;
    }
  }, [currentProfile, refreshPreferences]);

  /**
   * Get a decrypted API key (requires separate API call)
   */
  const getDecryptedApiKey = useCallback(async (key) => {
    if (!currentProfile) {
      return null;
    }

    try {
      const response = await fetch(
        `/api/user-preferences?profileId=${currentProfile.id}&key=${key}&includeDecrypted=true`
      );

      if (!response.ok) {
        throw new Error('Failed to get API key');
      }

      const data = await response.json();
      return data.value;
    } catch (err) {
      console.error('Failed to get decrypted API key:', err);
      return null;
    }
  }, [currentProfile]);

  /**
   * Check if a preference exists for the current profile
   */
  const hasPreference = useCallback((key) => {
    return preferences[key] !== undefined && preferences[key] !== null && preferences[key] !== '';
  }, [preferences]);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const loadedProfiles = await refreshProfiles();

        if (loadedProfiles.length > 0) {
          // Try to restore previously selected profile from localStorage
          const savedProfileId = localStorage.getItem(SELECTED_PROFILE_KEY);

          if (savedProfileId) {
            const savedProfile = loadedProfiles.find(p => p.id === parseInt(savedProfileId, 10));
            if (savedProfile) {
              setCurrentProfile(savedProfile);
              await refreshPreferences(savedProfile.id);
            } else {
              // Saved profile no longer exists, fall back to default
              const defaultProfile = loadedProfiles.find(p => p.isDefault) || loadedProfiles[0];
              if (defaultProfile) {
                setCurrentProfile(defaultProfile);
                localStorage.setItem(SELECTED_PROFILE_KEY, String(defaultProfile.id));
                await refreshPreferences(defaultProfile.id);
              }
            }
          } else {
            // No saved selection, use default or first profile
            const defaultProfile = loadedProfiles.find(p => p.isDefault) || loadedProfiles[0];
            if (defaultProfile) {
              setCurrentProfile(defaultProfile);
              localStorage.setItem(SELECTED_PROFILE_KEY, String(defaultProfile.id));
              await refreshPreferences(defaultProfile.id);
            }
          }
        }
      } catch (err) {
        console.error('Profile initialization error:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, [refreshProfiles, refreshPreferences]);

  const value = {
    // State
    profiles,
    currentProfile,
    preferences,
    isLoading,
    error,

    // Profile management
    selectProfile,
    createProfile,
    updateProfile,
    archiveProfile,
    refreshProfiles,

    // Preference management
    setPreference,
    setPreferences: savePreferences,  // Alias for backwards compatibility
    savePreferences,
    refreshPreferences,
    getDecryptedApiKey,
    hasPreference,

    // Convenience getters
    hasProfile: !!currentProfile,
    profileId: currentProfile?.id || null,
    profileName: currentProfile?.displayName || currentProfile?.name || null
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

/**
 * Hook to access profile context
 */
export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

/**
 * Hook to get just the current profile ID (for API calls)
 */
export function useProfileId() {
  const { profileId } = useProfile();
  return profileId;
}

export default ProfileContext;
