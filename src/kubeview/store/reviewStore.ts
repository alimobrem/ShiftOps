/**
 * Review Store — tracks AI-proposed infrastructure changes awaiting human review.
 *
 * Real data comes from monitorStore (pendingActions / recentActions).
 * Persists UI preferences to localStorage.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActionReport } from '../engine/monitorClient';
import { useMonitorStore } from './monitorStore';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DiffField {
  key: string;
  before: string;
  after: string;
}

export interface DiffData {
  before: string;
  after: string;
  fields: DiffField[];
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

export interface ReviewItem {
  id: string;
  title: string;
  description: string;
  riskLevel: RiskLevel;
  agentName: string;
  agentIcon: string;
  resourceType: string;
  resourceName: string;
  namespace: string;
  diff: DiffData;
  businessImpact: string;
  status: ReviewStatus;
  createdAt: number;
  reviewedAt?: number;
}

export interface ReviewFilters {
  riskLevel?: RiskLevel;
  resourceType?: string;
  namespace?: string;
  search?: string;
}

interface ReviewState {
  activeTab: 'pending' | 'approved' | 'rejected';
  filters: ReviewFilters;
  expandedId: string | null;

  approveReview: (id: string) => void;
  rejectReview: (id: string) => void;
  setFilter: (filters: Partial<ReviewFilters>) => void;
  setActiveTab: (tab: 'pending' | 'approved' | 'rejected') => void;
  setExpanded: (id: string | null) => void;
}

// ---- Mapping helpers ----

function mapActionRiskLevel(action: ActionReport): RiskLevel {
  // ActionReport doesn't have riskLevel; infer from confidence or default to medium
  if (action.confidence != null) {
    if (action.confidence < 0.4) return 'high';
    if (action.confidence < 0.7) return 'medium';
    return 'low';
  }
  return 'medium';
}

function extractResourceInfo(action: ActionReport): {
  resourceType: string;
  resourceName: string;
  namespace: string;
} {
  // Try to extract from input or beforeState
  const input = action.input || {};
  const kind = (input.kind as string) || (input.resourceKind as string) || '';
  const name = (input.name as string) || (input.resourceName as string) || '';
  const ns = (input.namespace as string) || '';

  if (kind && name) {
    return { resourceType: kind, resourceName: name, namespace: ns };
  }

  // Try parsing from beforeState YAML (first two lines often have kind/name)
  if (action.beforeState) {
    const lines = action.beforeState.split('\n');
    let parsedKind = '';
    let parsedName = '';
    let parsedNs = '';
    for (const line of lines.slice(0, 10)) {
      const kindMatch = line.match(/^kind:\s*(.+)/);
      if (kindMatch) parsedKind = kindMatch[1].trim();
      const nameMatch = line.match(/^\s+name:\s*(.+)/);
      if (nameMatch && !parsedName) parsedName = nameMatch[1].trim();
      const nsMatch = line.match(/^\s+namespace:\s*(.+)/);
      if (nsMatch) parsedNs = nsMatch[1].trim();
    }
    if (parsedKind || parsedName) {
      return {
        resourceType: parsedKind || 'Resource',
        resourceName: parsedName || action.tool,
        namespace: parsedNs,
      };
    }
  }

  return { resourceType: 'Resource', resourceName: action.tool, namespace: '' };
}

function mapActionStatus(action: ActionReport): ReviewStatus {
  switch (action.status) {
    case 'proposed':
      return 'pending';
    case 'completed':
    case 'executing':
      return 'approved';
    case 'failed':
    case 'rolled_back':
      return 'rejected';
    default:
      return 'pending';
  }
}

/** Map an ActionReport from the monitor system into a ReviewItem. */
export function actionToReviewItem(action: ActionReport): ReviewItem {
  const { resourceType, resourceName, namespace } = extractResourceInfo(action);
  const status = mapActionStatus(action);

  return {
    id: action.id,
    title: action.tool.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: action.reasoning || `Proposed action: ${action.tool}`,
    riskLevel: mapActionRiskLevel(action),
    agentName: 'SRE Agent',
    agentIcon: 'bot',
    resourceType,
    resourceName,
    namespace,
    diff: {
      before: action.beforeState || '',
      after: action.afterState || '',
      fields: action.beforeState && action.afterState
        ? [{ key: 'state', before: '(before)', after: '(after)' }]
        : [],
    },
    businessImpact: action.reasoning || 'Automated remediation proposed by the SRE agent.',
    status,
    createdAt: action.timestamp,
    reviewedAt: status !== 'pending' ? action.timestamp + (action.durationMs || 0) : undefined,
  };
}

/** Maps monitor actions into ReviewItems. Memoized to avoid YAML parsing on every render. */
export function useAllReviews(): ReviewItem[] {
  const pendingActions = useMonitorStore((s) => s.pendingActions);
  const recentActions = useMonitorStore((s) => s.recentActions);

  return useMemo(() => {
    const all = [...pendingActions, ...recentActions];
    return all.map(actionToReviewItem);
  }, [pendingActions, recentActions]);
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      activeTab: 'pending',
      filters: {},
      expandedId: null,

      approveReview: (id) => {
        useMonitorStore.getState().approveAction(id);
      },

      rejectReview: (id) => {
        useMonitorStore.getState().rejectAction(id);
      },

      setFilter: (filters) =>
        set((state) => ({ filters: { ...state.filters, ...filters } })),

      setActiveTab: (tab) => set({ activeTab: tab }),

      setExpanded: (id) => set({ expandedId: id }),
    }),
    {
      name: 'openshiftpulse-reviews',
      partialize: (state) => ({
        activeTab: state.activeTab,
      }),
    },
  ),
);
