/**
 * useCapabilityDetection — detects when agent tool/skill count changes
 * and shows a toast notification. Persists last-known counts in localStorage
 * to avoid re-toasting on page reload.
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../store/uiStore';

const STORAGE_KEY = 'pulse-agent-capability-counts';
const AGENT_BASE = '/api/agent';

export interface AgentVersionInfo {
  protocol: string;
  agent: string;
  tools: number;
  skills?: number;
  features: string[];
}

function loadStoredCounts(): { tools: number; skills: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredCounts(tools: number, skills: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tools, skills }));
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Poll `/api/agent/version` and toast when tool or skill counts increase.
 * Call this once near the app root (e.g. in App.tsx or the main layout).
 */
export function useCapabilityDetection() {
  const initializedRef = useRef(false);

  const { data: versionInfo } = useQuery<AgentVersionInfo>({
    queryKey: ['agent', 'version'],
    queryFn: async () => {
      const res = await fetch(`${AGENT_BASE}/version`);
      if (!res.ok) throw new Error('Agent version fetch failed');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!versionInfo) return;

    const currentTools = versionInfo.tools ?? 0;
    const currentSkills = versionInfo.skills ?? 0;
    const stored = loadStoredCounts();

    if (!stored) {
      // First time — store baseline, no toast
      saveStoredCounts(currentTools, currentSkills);
      initializedRef.current = true;
      return;
    }

    // Only toast if we have already initialized (not on first mount with stored data)
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Check if counts changed from stored values
      if (currentTools === stored.tools && currentSkills === stored.skills) {
        return;
      }
    }

    const newTools = currentTools - stored.tools;
    const newSkills = currentSkills - stored.skills;

    if (newTools > 0 || newSkills > 0) {
      const parts: string[] = [];
      if (newTools > 0) parts.push(`${newTools} new tool${newTools !== 1 ? 's' : ''}`);
      if (newSkills > 0) parts.push(`${newSkills} new skill${newSkills !== 1 ? 's' : ''}`);

      useUIStore.getState().addToast({
        type: 'success',
        tier: 'background',
        title: `${parts.join(' and ')} available`,
        detail: 'Check the Toolbox for details',
        duration: 8000,
      });
    }

    // Always update stored counts (even if count decreased)
    saveStoredCounts(currentTools, currentSkills);
  }, [versionInfo]);
}
