import { useEffect, useState, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns users before navigating away from unsaved changes.
 * Handles both in-app navigation (react-router useBlocker) and
 * browser-level navigation (beforeunload).
 *
 * Returns { showConfirm, confirmNavigation, cancelNavigation } to
 * render a ConfirmDialog when in-app navigation is blocked.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const [showConfirm, setShowConfirm] = useState(false);

  // Block in-app navigation via react-router
  const blocker = useBlocker(hasChanges);

  // When blocker activates, show confirm dialog
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowConfirm(true);
    }
  }, [blocker.state]);

  // Browser/tab close warning
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const confirmNavigation = useCallback(() => {
    setShowConfirm(false);
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  const cancelNavigation = useCallback(() => {
    setShowConfirm(false);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return { showConfirm, confirmNavigation, cancelNavigation };
}
