import { useEffect, useState, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns users before navigating away from unsaved changes.
 * Combines react-router useBlocker (in-app) with beforeunload (browser-level).
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const [showConfirm, setShowConfirm] = useState(false);
  const blocker = useBlocker(hasChanges);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowConfirm(true);
    }
  }, [blocker.state]);

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
