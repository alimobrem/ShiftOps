/**
 * SaveViewWatcher — watches for pendingViewSpec from the agent and
 * shows a toast prompting the user to save the dashboard.
 */

import { useEffect, useRef } from 'react';
import { useAgentStore } from '../../store/agentStore';
import { useCustomViewStore } from '../../store/customViewStore';
import { useUIStore } from '../../store/uiStore';

export function SaveViewWatcher() {
  const pendingViewSpec = useAgentStore((s) => s.pendingViewSpec);
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingViewSpec || pendingViewSpec.id === lastHandled.current) return;
    lastHandled.current = pendingViewSpec.id;

    const { addToast } = useUIStore.getState();
    addToast({
      type: 'success',
      title: `Dashboard ready: "${pendingViewSpec.title}"`,
      detail: pendingViewSpec.description || `${pendingViewSpec.layout.length} widgets`,
      duration: 0, // Don't auto-dismiss — user needs to act
      action: {
        label: 'Save Dashboard',
        onClick: () => {
          useCustomViewStore.getState().saveView(pendingViewSpec);
          useAgentStore.setState({ pendingViewSpec: null });
        },
      },
    });
  }, [pendingViewSpec]);

  return null;
}
