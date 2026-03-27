/**
 * Monitor Store — manages state for the autonomous SRE agent monitor channel.
 * Receives findings, predictions, and action reports over WebSocket.
 * Persists user preferences and recent data to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MonitorClient,
  type MonitorEvent,
  type Finding,
  type ActionReport,
  type Prediction,
} from '../engine/monitorClient';
import {
  fetchFixHistory,
  type ActionRecord,
  type FixHistoryFilters,
} from '../engine/fixHistory';

const MAX_FINDINGS = 200;
const MAX_PREDICTIONS = 50;
const MAX_RECENT_ACTIONS = 50;

interface MonitorState {
  // Connection
  connected: boolean;
  lastScanTime: number;
  nextScanTime: number;
  activeWatches: string[];

  // Data
  findings: Finding[];
  dismissedFindingIds: string[];
  predictions: Prediction[];
  pendingActions: ActionReport[];
  recentActions: ActionReport[];

  // Fix history (REST-loaded)
  fixHistory: ActionRecord[];
  fixHistoryTotal: number;
  fixHistoryPage: number;
  fixHistoryLoading: boolean;

  // Preferences
  monitorEnabled: boolean;
  autoFixCategories: string[];

  // UI
  unreadCount: number;
  notificationCenterOpen: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  dismissFinding: (id: string) => void;
  approveAction: (actionId: string) => void;
  rejectAction: (actionId: string) => void;
  setMonitorEnabled: (enabled: boolean) => void;
  setAutoFixCategories: (categories: string[]) => void;
  loadFixHistory: (page?: number, filters?: FixHistoryFilters) => void;
  markAllRead: () => void;
  toggleNotificationCenter: () => void;
}

let client: MonitorClient | null = null;
let unsubscribe: (() => void) | null = null;

function capArray<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(-max) : arr;
}

export const useMonitorStore = create<MonitorState>()(
  persist(
    (set, get) => ({
      // Connection
      connected: false,
      lastScanTime: 0,
      nextScanTime: 0,
      activeWatches: [],

      // Data
      findings: [],
      dismissedFindingIds: [],
      predictions: [],
      pendingActions: [],
      recentActions: [],

      // Fix history
      fixHistory: [],
      fixHistoryTotal: 0,
      fixHistoryPage: 1,
      fixHistoryLoading: false,

      // Preferences
      monitorEnabled: true,
      autoFixCategories: [],

      // UI
      unreadCount: 0,
      notificationCenterOpen: false,

      connect: () => {
        if (client && get().connected) return;
        if (unsubscribe) unsubscribe();
        if (client) client.disconnect();

        client = new MonitorClient();

        unsubscribe = client.on((event: MonitorEvent) => {
          switch (event.type) {
            case 'connected':
              set({ connected: true });
              break;

            case 'disconnected':
              set({ connected: false });
              break;

            case 'finding': {
              const { type: _, ...finding } = event;
              const dismissed = get().dismissedFindingIds;
              if (dismissed.includes(finding.id)) break;
              set((s) => ({
                findings: capArray([...s.findings, finding], MAX_FINDINGS),
                unreadCount: s.unreadCount + 1,
              }));
              break;
            }

            case 'action_report': {
              const { type: _, ...report } = event;
              if (report.status === 'proposed') {
                set((s) => ({
                  pendingActions: [...s.pendingActions, report],
                  unreadCount: s.unreadCount + 1,
                }));
              } else {
                // Move from pending to recent on status change
                set((s) => ({
                  pendingActions: s.pendingActions.filter(
                    (a) => a.id !== report.id,
                  ),
                  recentActions: capArray(
                    [...s.recentActions, report],
                    MAX_RECENT_ACTIONS,
                  ),
                }));
              }
              break;
            }

            case 'prediction': {
              const { type: _, ...prediction } = event;
              set((s) => ({
                predictions: capArray(
                  [...s.predictions, prediction],
                  MAX_PREDICTIONS,
                ),
                unreadCount: s.unreadCount + 1,
              }));
              break;
            }

            case 'monitor_status': {
              set({
                activeWatches: event.activeWatches,
                lastScanTime: event.lastScan,
                nextScanTime: event.nextScan,
              });
              break;
            }

            case 'error':
              console.error('Monitor error:', event.message);
              break;
          }
        });

        const state = get();
        client.connect('observe', state.autoFixCategories);
      },

      disconnect: () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (client) {
          client.disconnect();
          client = null;
        }
        set({ connected: false });
      },

      dismissFinding: (id) => {
        set((s) => ({
          findings: s.findings.filter((f) => f.id !== id),
          dismissedFindingIds: [...s.dismissedFindingIds, id],
        }));
      },

      approveAction: (actionId) => {
        if (client) client.approveAction(actionId);
      },

      rejectAction: (actionId) => {
        if (client) client.rejectAction(actionId);
        set((s) => ({
          pendingActions: s.pendingActions.filter((a) => a.id !== actionId),
        }));
      },

      setMonitorEnabled: (enabled) => {
        set({ monitorEnabled: enabled });
        if (enabled) {
          get().connect();
        } else {
          get().disconnect();
        }
      },

      setAutoFixCategories: (categories) => {
        set({ autoFixCategories: categories });
      },

      loadFixHistory: async (page = 1, filters?) => {
        set({ fixHistoryLoading: true });
        try {
          const response = await fetchFixHistory({ page, filters });
          set({
            fixHistory: response.actions,
            fixHistoryTotal: response.total,
            fixHistoryPage: response.page,
            fixHistoryLoading: false,
          });
        } catch (err) {
          console.error('Failed to load fix history:', err);
          set({ fixHistoryLoading: false });
        }
      },

      markAllRead: () => {
        set({ unreadCount: 0 });
      },

      toggleNotificationCenter: () => {
        set((s) => ({
          notificationCenterOpen: !s.notificationCenterOpen,
          // Mark as read when opening
          unreadCount: s.notificationCenterOpen ? s.unreadCount : 0,
        }));
      },
    }),
    {
      name: 'openshiftpulse-monitor',
      partialize: (state) => ({
        monitorEnabled: state.monitorEnabled,
        autoFixCategories: state.autoFixCategories,
        dismissedFindingIds: state.dismissedFindingIds,
        findings: state.findings.slice(-MAX_FINDINGS),
        predictions: state.predictions.slice(-MAX_PREDICTIONS),
        recentActions: state.recentActions.slice(-MAX_RECENT_ACTIONS),
      }),
    },
  ),
);
