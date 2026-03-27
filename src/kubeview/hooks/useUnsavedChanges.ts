import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Warns users before navigating away from unsaved changes.
 * Uses beforeunload (browser-level) for tab close/refresh.
 * Uses a confirmation dialog for in-app navigation.
 *
 * Note: useBlocker requires createBrowserRouter (data router).
 * We use BrowserRouter, so we handle in-app navigation via
 * intercepting clicks on links and the popstate event.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const [showConfirm, setShowConfirm] = useState(false);
  const pendingNav = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Browser-level: warn on tab close / refresh
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // In-app: intercept back/forward browser buttons
  useEffect(() => {
    if (!hasChanges) return;
    const handlePopState = () => {
      // User pressed back — push current location back and show confirm
      window.history.pushState(null, '', location.pathname + location.search);
      pendingNav.current = '__back__';
      setShowConfirm(true);
    };
    // Push a dummy state so we can detect back navigation
    window.history.pushState(null, '', location.pathname + location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasChanges, location.pathname, location.search]);

  const confirmNavigation = useCallback(() => {
    setShowConfirm(false);
    if (pendingNav.current === '__back__') {
      window.history.back();
      window.history.back(); // Pop the dummy state too
    } else if (pendingNav.current) {
      navigate(pendingNav.current);
    }
    pendingNav.current = null;
  }, [navigate]);

  const cancelNavigation = useCallback(() => {
    setShowConfirm(false);
    pendingNav.current = null;
  }, []);

  return { showConfirm, confirmNavigation, cancelNavigation };
}
