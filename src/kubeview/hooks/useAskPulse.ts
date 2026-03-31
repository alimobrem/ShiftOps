import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  detectNaturalLanguage,
  type AskPulseResponse,
} from '../engine/mockData/askPulseMocks';
import { AgentClient, type AgentEvent } from '../engine/agentClient';
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

/** Timeout for agent queries (ms) — Ask Pulse should be snappy */
const AGENT_TIMEOUT = 8000;
const DEBOUNCE_MS = 500;

/**
 * Dedicated AgentClient for Ask Pulse queries.
 * Kept separate from the dock agent chat so quick queries don't pollute conversation history.
 */
let askClient: AgentClient | null = null;
let askClientRefCount = 0;

function getAskClient(): AgentClient {
  if (!askClient) {
    askClient = new AgentClient('auto');
  }
  return askClient;
}

function retainAskClient() {
  askClientRefCount++;
  return getAskClient();
}

function releaseAskClient() {
  askClientRefCount--;
  if (askClientRefCount <= 0) {
    askClientRefCount = 0;
    if (askClient) {
      askClient.disconnect();
      askClient = null;
    }
  }
}

/**
 * Send a one-shot query to the agent and return the full text response.
 * Resolves with the response text or rejects on error/timeout.
 */
function queryAgent(client: AgentClient, query: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    let settled = false;
    let connUnsub: (() => void) | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('Agent query timed out')));
    }, AGENT_TIMEOUT);

    const onAbort = () => {
      settle(() => reject(new Error('Aborted')));
    };
    signal.addEventListener('abort', onAbort);

    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      unsubscribe();
      connUnsub?.();
    };

    const unsubscribe = client.on((event: AgentEvent) => {
      switch (event.type) {
        case 'done':
          settle(() => resolve(event.full_response));
          break;
        case 'error':
          settle(() => reject(new Error(event.message)));
          break;
      }
    });

    if (client.connected) {
      client.send(query);
    } else {
      connUnsub = client.on((ev: AgentEvent) => {
        if (ev.type === 'connected') {
          connUnsub?.();
          connUnsub = null;
          if (!settled) client.send(query);
        } else if (ev.type === 'error') {
          settle(() => reject(new Error((ev as { message: string }).message)));
        }
      });
      client.connect();
    }
  });
}

export function useAskPulse(query: string): UseAskPulseResult {
  const [response, setResponse] = useState<AskPulseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [agentAvailable, setAgentAvailable] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const isNaturalLanguage = useMemo(() => detectNaturalLanguage(query), [query]);

  // Manage dedicated client lifecycle
  useEffect(() => {
    retainAskClient();
    return () => releaseAskClient();
  }, []);

  useEffect(() => {
    // Clear previous debounce timer and abort in-flight request
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!isNaturalLanguage || !query.trim()) {
      setResponse(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setResponse(null);

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      const client = getAskClient();

      queryAgent(client, query, controller.signal)
        .then((text) => {
          if (!controller.signal.aborted) {
            setAgentAvailable(true);
            setResponse({
              text,
              suggestions: [],
              actions: [],
              fromAgent: true,
            });
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setAgentAvailable(false);
          setResponse(null);
          setIsLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, isNaturalLanguage]);

  const openInAgent = useCallback(() => {
    if (!query.trim()) return;
    useAgentStore.getState().connectAndSend(query);
    useUIStore.getState().openDock('agent');
    useUIStore.getState().closeCommandPalette();
  }, [query]);

  return { isNaturalLanguage, response, isLoading, agentAvailable, openInAgent };
}
