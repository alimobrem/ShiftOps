import { useState, useEffect, useMemo, useCallback } from 'react';
import { detectNaturalLanguage } from '../engine/askPulseUtils';
import type { AskPulseResponse } from '../engine/types/askPulse';
import { useAgentStore } from '../store/agentStore';
import { useUIStore } from '../store/uiStore';

interface UseAskPulseResult {
  isNaturalLanguage: boolean;
  response: AskPulseResponse | null;
  isLoading: boolean;
  /** Whether the agent backend is reachable */
  agentAvailable: boolean;
  /** Send the current query to the dock agent panel for a full conversation */
  openInAgent: () => void;
}

export function useAskPulse(query: string): UseAskPulseResult {
  const [response, setResponse] = useState<AskPulseResponse | null>(null);
  const agentAvailable = useAgentStore(s => s.connected);

  const isNaturalLanguage = useMemo(() => detectNaturalLanguage(query), [query]);

  // No dedicated WebSocket — show prompt to open in agent dock instead.
  // The main agentStore connection handles all AI interactions.
  useEffect(() => {
    if (!isNaturalLanguage || !query.trim()) {
      setResponse(null);
      return;
    }
    setResponse({
      text: `Press **Enter** or click **Open in Agent** to ask the AI about: "${query.slice(0, 80)}"`,
      suggestions: [],
      actions: [],
      fromAgent: false,
    });
  }, [query, isNaturalLanguage]);

  const openInAgent = useCallback(() => {
    if (!query.trim()) return;
    useAgentStore.getState().connectAndSend(query);
    useUIStore.getState().expandAISidebar();
    useUIStore.getState().setAISidebarMode('chat');
    useUIStore.getState().closeCommandPalette();
  }, [query]);

  return { isNaturalLanguage, response, isLoading: false, agentAvailable, openInAgent };
}
