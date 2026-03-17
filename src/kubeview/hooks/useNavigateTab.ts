import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';

/**
 * Hook that combines addTab + navigate into a single `go(path, title)` function.
 * Replaces the duplicated `go()` helper in 10+ views.
 */
export function useNavigateTab() {
  const navigate = useNavigate();
  const addTab = useUIStore((s) => s.addTab);

  return useCallback((path: string, title: string) => {
    addTab({ title, path, pinned: false, closable: true });
    navigate(path);
  }, [navigate, addTab]);
}
