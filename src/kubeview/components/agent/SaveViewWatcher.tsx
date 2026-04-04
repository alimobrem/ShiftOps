/**
 * SaveViewWatcher — syncs local view state when the agent creates a view.
 * Views are auto-saved on the backend via create_dashboard — this component
 * adds the view to local state, navigates to it, and triggers a background
 * refresh for consistency.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentStore } from '../../store/agentStore';
import { useCustomViewStore } from '../../store/customViewStore';
import { useUIStore } from '../../store/uiStore';

export function SaveViewWatcher() {
  const pendingViewSpec = useAgentStore((s) => s.pendingViewSpec);
  const lastHandledViewSpec = useRef<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingViewSpec || pendingViewSpec.id === lastHandledViewSpec.current) return;
    lastHandledViewSpec.current = pendingViewSpec.id;

    const store = useCustomViewStore.getState();

    // Add view directly to local state (bypasses loadViews debounce)
    const exists = store.views.some((v) => v.id === pendingViewSpec.id);
    if (!exists) {
      useCustomViewStore.setState((s) => ({
        views: [...s.views, pendingViewSpec],
      }));
    }

    // Open a tab and navigate to the new view
    const path = `/custom/${pendingViewSpec.id}`;
    useUIStore.getState().addTab({
      title: pendingViewSpec.title || 'Custom View',
      path,
      pinned: false,
      closable: true,
    });
    navigate(path);

    // Show toast
    useUIStore.getState().addToast({
      type: 'success',
      title: 'Dashboard created',
      detail: pendingViewSpec.title,
      duration: 4000,
    });

    // Background refresh for consistency with backend
    store.forceLoadViews();

    useAgentStore.setState({ pendingViewSpec: null });
  }, [pendingViewSpec, navigate]);

  return null;
}
