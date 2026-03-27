// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonitorClient } from '../monitorClient';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);

describe('MonitorClient', () => {
  let client: MonitorClient;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    client = new MonitorClient();
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it('creates in disconnected state', () => {
    expect(client.connected).toBe(false);
  });

  it('connects and emits connected event', async () => {
    const events: string[] = [];
    client.on((e) => events.push(e.type));
    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    expect(events).toContain('connected');
    expect(client.connected).toBe(true);
  });

  it('sends subscribe_monitor on connect', async () => {
    client.connect('supervised', ['memory', 'cpu']);
    await vi.advanceTimersByTimeAsync(10);
    const ws = (client as any).ws as MockWebSocket;
    expect(ws.sent).toHaveLength(1);
    const parsed = JSON.parse(ws.sent[0]);
    expect(parsed.type).toBe('subscribe_monitor');
    expect(parsed.trustLevel).toBe('supervised');
    expect(parsed.autoFixCategories).toEqual(['memory', 'cpu']);
  });

  it('emits finding events from WebSocket messages', async () => {
    const events: any[] = [];
    client.on((e) => events.push(e));
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'finding',
        id: 'f1',
        severity: 'critical',
        category: 'memory',
        title: 'OOM Risk',
        summary: 'Pod nearing memory limit',
        resources: [{ kind: 'Pod', name: 'web-1', namespace: 'default' }],
        autoFixable: true,
        timestamp: Date.now(),
      }),
    });

    const finding = events.find((e) => e.type === 'finding');
    expect(finding).toBeDefined();
    expect(finding.id).toBe('f1');
    expect(finding.severity).toBe('critical');
  });

  it('emits disconnected on close', async () => {
    const events: string[] = [];
    client.on((e) => events.push(e.type));
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    client.disconnect();
    expect(events).toContain('disconnected');
    expect(client.connected).toBe(false);
  });

  it('approveAction sends JSON message', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    client.approveAction('action-1');
    const ws = (client as any).ws as MockWebSocket;
    // sent[0] is subscribe_monitor, sent[1] is approve
    const parsed = JSON.parse(ws.sent[1]);
    expect(parsed.type).toBe('approve_action');
    expect(parsed.actionId).toBe('action-1');
  });

  it('rejectAction sends JSON message', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    client.rejectAction('action-2');
    const ws = (client as any).ws as MockWebSocket;
    const parsed = JSON.parse(ws.sent[1]);
    expect(parsed.type).toBe('reject_action');
    expect(parsed.actionId).toBe('action-2');
  });

  it('requestFixHistory sends JSON message', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    client.requestFixHistory({ category: 'memory' }, 2);
    const ws = (client as any).ws as MockWebSocket;
    const parsed = JSON.parse(ws.sent[1]);
    expect(parsed.type).toBe('request_fix_history');
    expect(parsed.filters).toEqual({ category: 'memory' });
    expect(parsed.page).toBe(2);
  });

  it('emits error when sending without connection', () => {
    const events: any[] = [];
    client.on((e) => events.push(e));
    client.approveAction('x');
    expect(events).toContainEqual({
      type: 'error',
      message: 'Not connected to monitor',
    });
  });

  it('unsubscribe removes handler', async () => {
    const events: string[] = [];
    const unsub = client.on((e) => events.push(e.type));
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    unsub();
    const ws = (client as any).ws as MockWebSocket;
    ws.onmessage?.({
      data: JSON.stringify({ type: 'finding', id: 'f2' }),
    });

    // Only connected event, no finding
    expect(events).toEqual(['connected']);
  });

  it('schedules reconnect on unexpected close', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    // Simulate unexpected close (not user-initiated)
    const ws = (client as any).ws as MockWebSocket;
    ws.onclose?.();

    // Should schedule reconnect — advance past base delay + jitter
    expect((client as any).reconnectTimer).not.toBeNull();
  });

  it('does not reconnect after user disconnect', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);

    client.disconnect();
    expect((client as any).reconnectTimer).toBeNull();
  });

  it('reconnects immediately when tab becomes visible', async () => {
    client.connect();
    await vi.advanceTimersByTimeAsync(10);
    expect(client.connected).toBe(true);

    // Simulate unexpected close — schedules a reconnect timer
    (client as any)._connected = false;
    (client as any).ws = null;

    // Simulate tab becoming visible — should trigger reconnect
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);

    // Should be connected again after visibility-triggered reconnect
    expect(client.connected).toBe(true);
  });
});
