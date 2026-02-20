/**
 * AppAccessContext - Tracks which apps the current user can access
 *
 * Fetches allowed apps from /api/app-access on mount.
 * Provides hasAccess(appKey) for nav filtering and page guards.
 * Returns false during loading (deny by default).
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
        // If the endpoint fails, deny access (middleware guarantees authentication)
        setAllowedApps([]);
        return;
      }
      const data = await res.json();
      setAllowedApps(data.apps || []);
      setIsSuperuser(data.isSuperuser || false);
    } catch {
      // On error, deny access (middleware guarantees authentication)
      setAllowedApps([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const hasAccess = useCallback((appKey) => {
    // While loading, deny access (show nothing until permissions are confirmed)
    if (allowedApps === null) return false;
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
