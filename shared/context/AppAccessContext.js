/**
 * AppAccessContext - Tracks which apps the current user can access
 *
 * Fetches allowed apps from /api/app-access on mount.
 * Provides hasAccess(appKey) for nav filtering and page guards.
 * Returns true during loading for graceful fallback.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppAccessContext = createContext(null);

export function AppAccessProvider({ children }) {
  const [allowedApps, setAllowedApps] = useState(null); // null = loading
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/app-access');
      if (!res.ok) {
        // If the endpoint fails (e.g. no profile yet), allow all to avoid lockout
        setAllowedApps(null);
        return;
      }
      const data = await res.json();
      setAllowedApps(data.apps || []);
      setIsSuperuser(data.isSuperuser || false);
    } catch {
      // On error, allow all (graceful degradation)
      setAllowedApps(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const hasAccess = useCallback((appKey) => {
    // While loading or on error, allow access (graceful fallback)
    if (allowedApps === null) return true;
    return allowedApps.includes(appKey);
  }, [allowedApps]);

  const value = {
    allowedApps,
    isSuperuser,
    isLoading,
    hasAccess,
    refreshAccess: fetchAccess,
  };

  return (
    <AppAccessContext.Provider value={value}>
      {children}
    </AppAccessContext.Provider>
  );
}

export function useAppAccess() {
  const context = useContext(AppAccessContext);
  if (!context) {
    throw new Error('useAppAccess must be used within an AppAccessProvider');
  }
  return context;
}

export default AppAccessContext;
