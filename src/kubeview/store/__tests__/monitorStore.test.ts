// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MonitorClient
vi.mock('../../engine/monitorClient', () => {
  return {
    MonitorClient: class MockMonitorClient {
      connected = false;
      private handlers = new Set<(e: any) => void>();

      on(handler: (e: any) => void) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
      }

      connect() {
        this.connected = true;
        this.emit({ type: 'connected' });
      }

      disconnect() {
        this.connected = false;
      }

      approveAction() {}
      rejectAction() {}
      requestFixHistory() {}

      private emit(event: any) {
        for (const h of this.handlers) h(event);
      }

      // Test helper: simulate incoming event
      _simulateEvent(event: any) {
        this.emit(event);
      }
    },
  };
});

// Mock fetchFixHistory
vi.mock('../../engine/fixHistory', () => ({
  fetchFixHistory: vi.fn().mockResolvedValue({
    actions: [
      {
        id: 'a1',
        findingId: 'f1',
        timestamp: 1000,
        category: 'memory',
        tool: 'scale_deployment',
        input: {},
        status: 'completed',
        beforeState: '1 replica',
        afterState: '3 replicas',
        reasoning: 'OOM risk',
        durationMs: 500,
        rollbackAvailable: true,
        resources: [],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  }),
}));

import { useMonitorStore } from '../monitorStore';

describe('monitorStore', () => {
  beforeEach(() => {
    const { disconnect } = useMonitorStore.getState();
    disconnect();
    useMonitorStore.setState({
      connected: false,
      lastScanTime: 0,
      nextScanTime: 0,
      activeWatches: [],
      findings: [],
      dismissedFindingIds: [],
      predictions: [],
      pendingActions: [],
      recentActions: [],
      fixHistory: [],
      fixHistoryTotal: 0,
      fixHistoryPage: 1,
      fixHistoryLoading: false,
      monitorEnabled: true,
      autoFixCategories: [],
      unreadCount: 0,
      notificationCenterOpen: false,
    });
  });

  it('initializes with default state', () => {
    const state = useMonitorStore.getState();
    expect(state.connected).toBe(false);
    expect(state.findings).toEqual([]);
    expect(state.predictions).toEqual([]);
    expect(state.monitorEnabled).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('connect sets connected to true', () => {
    useMonitorStore.getState().connect();
    expect(useMonitorStore.getState().connected).toBe(true);
  });

  it('disconnect sets connected to false', () => {
    useMonitorStore.getState().connect();
    useMonitorStore.getState().disconnect();
    expect(useMonitorStore.getState().connected).toBe(false);
  });

  it('dismissFinding removes finding and records id', () => {
    useMonitorStore.setState({
      findings: [
        {
          id: 'f1',
          severity: 'warning',
          category: 'cpu',
          title: 'High CPU',
          summary: 'CPU at 95%',
          resources: [],
          autoFixable: false,
          timestamp: 1000,
        },
      ],
    });

    useMonitorStore.getState().dismissFinding('f1');
    const state = useMonitorStore.getState();
    expect(state.findings).toEqual([]);
    expect(state.dismissedFindingIds).toContain('f1');
  });

  it('setMonitorEnabled toggles and connects/disconnects', () => {
    useMonitorStore.getState().setMonitorEnabled(false);
    expect(useMonitorStore.getState().monitorEnabled).toBe(false);
    expect(useMonitorStore.getState().connected).toBe(false);

    useMonitorStore.getState().setMonitorEnabled(true);
    expect(useMonitorStore.getState().monitorEnabled).toBe(true);
    expect(useMonitorStore.getState().connected).toBe(true);
  });

  it('setAutoFixCategories updates categories', () => {
    useMonitorStore.getState().setAutoFixCategories(['memory', 'disk']);
    expect(useMonitorStore.getState().autoFixCategories).toEqual([
      'memory',
      'disk',
    ]);
  });

  it('markAllRead resets unread count', () => {
    useMonitorStore.setState({ unreadCount: 5 });
    useMonitorStore.getState().markAllRead();
    expect(useMonitorStore.getState().unreadCount).toBe(0);
  });

  it('toggleNotificationCenter toggles open state and clears unread on open', () => {
    useMonitorStore.setState({ unreadCount: 3, notificationCenterOpen: false });
    useMonitorStore.getState().toggleNotificationCenter();
    const state = useMonitorStore.getState();
    expect(state.notificationCenterOpen).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('toggleNotificationCenter preserves unread when closing', () => {
    useMonitorStore.setState({ unreadCount: 3, notificationCenterOpen: true });
    useMonitorStore.getState().toggleNotificationCenter();
    const state = useMonitorStore.getState();
    expect(state.notificationCenterOpen).toBe(false);
    expect(state.unreadCount).toBe(3);
  });

  it('loadFixHistory fetches and updates state', async () => {
    await useMonitorStore.getState().loadFixHistory();
    const state = useMonitorStore.getState();
    expect(state.fixHistory).toHaveLength(1);
    expect(state.fixHistoryTotal).toBe(1);
    expect(state.fixHistoryLoading).toBe(false);
  });
});
