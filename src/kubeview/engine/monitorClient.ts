/**
 * Monitor WebSocket client — connects to the Pulse Agent monitor channel.
 *
 * Unlike the interactive AgentClient, this is a background connection that
 * receives autonomous findings, predictions, and action reports from the
 * 24/7 SRE agent. It uses infinite reconnect with exponential backoff and
 * reduces polling frequency when the tab is hidden.
 */

// ---- Types ----

export interface ResourceRef {
  kind: string;
  name: string;
  namespace?: string;
}

export interface Finding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  summary: string;
  resources: ResourceRef[];
  autoFixable: boolean;
  runbookId?: string;
  timestamp: number;
}

export interface ActionReport {
  id: string;
  findingId: string;
  tool: string;
  input: Record<string, unknown>;
  status: 'proposed' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  beforeState?: string;
  afterState?: string;
  error?: string;
  timestamp: number;
  reasoning?: string;
  durationMs?: number;
}

export interface Prediction {
  id: string;
  category: string;
  title: string;
  detail: string;
  eta: string;
  confidence: number;
  resources: ResourceRef[];
  recommendedAction?: string;
  timestamp: number;
}

export interface MonitorStatus {
  activeWatches: string[];
  lastScan: number;
  findingsCount: number;
  nextScan: number;
}

export type MonitorEvent =
  | ({ type: 'finding' } & Finding)
  | ({ type: 'action_report' } & ActionReport)
  | ({ type: 'prediction' } & Prediction)
  | ({ type: 'monitor_status' } & MonitorStatus)
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; message: string };

type EventHandler = (event: MonitorEvent) => void;

const MONITOR_ENDPOINT = '/api/agent/ws/monitor';
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30_000;
const HIDDEN_RECONNECT_DELAY = 60_000;

export class MonitorClient {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _disconnectedByUser = false;
  private trustLevel = 'observe';
  private autoFixCategories: string[] = [];
  private visibilityHandler: (() => void) | null = null;

  get connected(): boolean {
    return this._connected;
  }

  /** Subscribe to monitor events. Returns unsubscribe function. */
  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: MonitorEvent) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error('Monitor event handler error:', e);
      }
    }
  }

  /** Connect to the monitor WebSocket channel. */
  connect(trustLevel = 'observe', autoFixCategories: string[] = []) {
    this._disconnectedByUser = false;
    this.trustLevel = trustLevel;
    this.autoFixCategories = autoFixCategories;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}${MONITOR_ENDPOINT}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      this.emit({ type: 'connected' });

      // Send subscription message with trust level and auto-fix categories
      this.ws?.send(
        JSON.stringify({
          type: 'subscribe_monitor',
          trustLevel: this.trustLevel,
          autoFixCategories: this.autoFixCategories,
        }),
      );
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as MonitorEvent;
        this.emit(data);
      } catch {
        console.error('Failed to parse monitor message:', event.data);
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.emit({ type: 'disconnected' });
      if (!this._disconnectedByUser) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };

    // Set up visibility change listener
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => this.handleVisibilityChange();
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private scheduleReconnect() {
    if (this._disconnectedByUser) return;
    if (this.reconnectTimer) return;

    // Check if tab is hidden — use longer delay
    const isHidden = document.visibilityState === 'hidden';
    const delay = isHidden
      ? HIDDEN_RECONNECT_DELAY
      : Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
          MAX_RECONNECT_DELAY,
        );

    // Add jitter (up to 20% of delay)
    const jitter = Math.random() * delay * 0.2;

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this._disconnectedByUser) {
        this.connect(this.trustLevel, this.autoFixCategories);
      }
    }, delay + jitter);
  }

  private handleVisibilityChange() {
    if (this._disconnectedByUser) return;

    if (document.visibilityState === 'visible') {
      // Tab became visible — reconnect immediately if disconnected
      if (!this._connected) {
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
        this.connect(this.trustLevel, this.autoFixCategories);
      }
    }
    // When hidden, scheduleReconnect already uses HIDDEN_RECONNECT_DELAY
  }

  /** Disconnect and stop reconnecting. */
  disconnect() {
    this._disconnectedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  /** Approve a proposed action. */
  approveAction(actionId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({ type: 'error', message: 'Not connected to monitor' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'approve_action', actionId }));
  }

  /** Reject a proposed action. */
  rejectAction(actionId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({ type: 'error', message: 'Not connected to monitor' });
      return;
    }
    this.ws.send(JSON.stringify({ type: 'reject_action', actionId }));
  }

  /** Request fix history with optional filters and pagination. */
  requestFixHistory(filters?: Record<string, unknown>, page?: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({ type: 'error', message: 'Not connected to monitor' });
      return;
    }
    this.ws.send(
      JSON.stringify({ type: 'request_fix_history', filters, page }),
    );
  }
}
