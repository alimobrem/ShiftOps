// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReviewStore, actionToReviewItem } from '../reviewStore';
import type { ActionReport } from '../../engine/monitorClient';

// Mock monitorStore so approveReview/rejectReview can delegate
vi.mock('../monitorStore', () => ({
  useMonitorStore: Object.assign(
    () => ({ pendingActions: [], recentActions: [] }),
    {
      getState: () => ({
        approveAction: vi.fn(),
        rejectAction: vi.fn(),
        pendingActions: [],
        recentActions: [],
      }),
    },
  ),
}));

describe('reviewStore', () => {
  beforeEach(() => {
    useReviewStore.setState({
      activeTab: 'pending',
      filters: {},
      expandedId: null,
    });
  });

  // ---- Initial state ----

  it('initializes with default state', () => {
    const state = useReviewStore.getState();
    expect(state.activeTab).toBe('pending');
    expect(state.filters).toEqual({});
    expect(state.expandedId).toBeNull();
  });

  // ---- setActiveTab ----

  it('setActiveTab switches tab', () => {
    useReviewStore.getState().setActiveTab('approved');
    expect(useReviewStore.getState().activeTab).toBe('approved');
  });

  it('setActiveTab switches to rejected', () => {
    useReviewStore.getState().setActiveTab('rejected');
    expect(useReviewStore.getState().activeTab).toBe('rejected');
  });

  // ---- setFilter ----

  it('setFilter merges partial filters', () => {
    useReviewStore.getState().setFilter({ riskLevel: 'high' });
    expect(useReviewStore.getState().filters).toEqual({ riskLevel: 'high' });

    useReviewStore.getState().setFilter({ namespace: 'kube-system' });
    expect(useReviewStore.getState().filters).toEqual({ riskLevel: 'high', namespace: 'kube-system' });
  });

  it('setFilter overwrites existing filter keys', () => {
    useReviewStore.getState().setFilter({ search: 'deploy' });
    useReviewStore.getState().setFilter({ search: 'pod' });
    expect(useReviewStore.getState().filters.search).toBe('pod');
  });

  // ---- setExpanded ----

  it('setExpanded sets and clears expanded id', () => {
    useReviewStore.getState().setExpanded('review-1');
    expect(useReviewStore.getState().expandedId).toBe('review-1');

    useReviewStore.getState().setExpanded(null);
    expect(useReviewStore.getState().expandedId).toBeNull();
  });

  // ---- approveReview / rejectReview ----

  it('approveReview delegates to monitorStore', () => {
    // Should not throw — it calls monitorStore.getState().approveAction
    expect(() => useReviewStore.getState().approveReview('action-1')).not.toThrow();
  });

  it('rejectReview delegates to monitorStore', () => {
    expect(() => useReviewStore.getState().rejectReview('action-1')).not.toThrow();
  });

  // ---- Persist config ----

  it('persists under openshiftpulse-reviews key with partialize', () => {
    const persistOptions = (useReviewStore as any).persist;
    expect(persistOptions).toBeDefined();
    expect(persistOptions.getOptions().name).toBe('openshiftpulse-reviews');
  });
});

describe('actionToReviewItem', () => {
  const baseAction: ActionReport = {
    id: 'a1',
    findingId: 'f1',
    tool: 'scale_deployment',
    input: { kind: 'Deployment', name: 'web-api', namespace: 'prod' },
    status: 'proposed',
    timestamp: 1000,
    reasoning: 'OOM risk detected',
  };

  it('maps a proposed action to a pending review', () => {
    const item = actionToReviewItem(baseAction);
    expect(item.id).toBe('a1');
    expect(item.status).toBe('pending');
    expect(item.title).toBe('Scale Deployment');
    expect(item.resourceType).toBe('Deployment');
    expect(item.resourceName).toBe('web-api');
    expect(item.namespace).toBe('prod');
    expect(item.description).toBe('OOM risk detected');
    expect(item.agentName).toBe('SRE Agent');
  });

  it('maps completed status to approved', () => {
    const item = actionToReviewItem({ ...baseAction, status: 'completed' });
    expect(item.status).toBe('approved');
  });

  it('maps executing status to approved', () => {
    const item = actionToReviewItem({ ...baseAction, status: 'executing' });
    expect(item.status).toBe('approved');
  });

  it('maps failed status to rejected', () => {
    const item = actionToReviewItem({ ...baseAction, status: 'failed' });
    expect(item.status).toBe('rejected');
  });

  it('maps rolled_back status to rejected', () => {
    const item = actionToReviewItem({ ...baseAction, status: 'rolled_back' });
    expect(item.status).toBe('rejected');
  });

  it('infers risk level from confidence', () => {
    expect(actionToReviewItem({ ...baseAction, confidence: 0.9 }).riskLevel).toBe('low');
    expect(actionToReviewItem({ ...baseAction, confidence: 0.5 }).riskLevel).toBe('medium');
    expect(actionToReviewItem({ ...baseAction, confidence: 0.2 }).riskLevel).toBe('high');
  });

  it('defaults risk level to medium when no confidence', () => {
    const item = actionToReviewItem({ ...baseAction, confidence: undefined });
    expect(item.riskLevel).toBe('medium');
  });

  it('extracts resource info from beforeState YAML when input is empty', () => {
    const action: ActionReport = {
      ...baseAction,
      input: {},
      beforeState: 'kind: ConfigMap\nmetadata:\n  name: app-config\n  namespace: staging\n',
    };
    const item = actionToReviewItem(action);
    expect(item.resourceType).toBe('ConfigMap');
    expect(item.resourceName).toBe('app-config');
    expect(item.namespace).toBe('staging');
  });

  it('falls back to tool name when no resource info available', () => {
    const action: ActionReport = {
      ...baseAction,
      input: {},
      beforeState: undefined,
    };
    const item = actionToReviewItem(action);
    expect(item.resourceType).toBe('Resource');
    expect(item.resourceName).toBe('scale_deployment');
  });

  it('builds diff from beforeState and afterState', () => {
    const action: ActionReport = {
      ...baseAction,
      beforeState: 'replicas: 1',
      afterState: 'replicas: 3',
    };
    const item = actionToReviewItem(action);
    expect(item.diff.before).toBe('replicas: 1');
    expect(item.diff.after).toBe('replicas: 3');
    expect(item.diff.fields).toHaveLength(1);
  });

  it('empty diff fields when no before/after state', () => {
    const action: ActionReport = {
      ...baseAction,
      beforeState: undefined,
      afterState: undefined,
    };
    const item = actionToReviewItem(action);
    expect(item.diff.fields).toEqual([]);
  });

  it('sets reviewedAt for non-pending reviews', () => {
    const item = actionToReviewItem({ ...baseAction, status: 'completed', durationMs: 500 });
    expect(item.reviewedAt).toBe(1500); // timestamp + durationMs
  });

  it('reviewedAt is undefined for pending reviews', () => {
    const item = actionToReviewItem(baseAction);
    expect(item.reviewedAt).toBeUndefined();
  });

  it('uses resourceKind and resourceName from input', () => {
    const action: ActionReport = {
      ...baseAction,
      input: { resourceKind: 'StatefulSet', resourceName: 'redis' },
    };
    const item = actionToReviewItem(action);
    expect(item.resourceType).toBe('StatefulSet');
    expect(item.resourceName).toBe('redis');
  });
});
