// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startAgentNotifications, stopAgentNotifications, isAgentNotificationsRunning } from '../agentNotifications';

const mockAddToast = vi.fn();

vi.mock('../../store/uiStore', () => ({
  useUIStore: { getState: () => ({ addToast: mockAddToast, openDock: vi.fn(), addDegradedReason: vi.fn(), removeDegradedReason: vi.fn() }) },
}));

vi.mock('../../store/agentStore', () => ({
  useAgentStore: { getState: () => ({ connected: false, sendMessage: vi.fn() }) },
}));

vi.mock('../../hooks/useMonitor', () => ({
  emitMonitorEvent: vi.fn(),
}));

vi.mock('../../store/monitorStore', () => ({
  useMonitorStore: {
    getState: () => ({ connect: vi.fn(), disconnect: vi.fn(), findings: [], recentActions: [] }),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

let mockHandler: ((event: Record<string, unknown>) => void) | null = null;
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSend = vi.fn();

vi.mock('../agentClient', () => ({
  AgentClient: class {
    on(handler: (event: Record<string, unknown>) => void) {
      mockHandler = handler;
      return () => {};
    }
    connect() { mockConnect(); }
    disconnect() { mockDisconnect(); }
    send(content: string) { mockSend(content); }
  },
}));

// Mock fetch to return protocol '1' (v1 fallback path)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('agentNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockHandler = null;
    stopAgentNotifications();
    // Default: return protocol '1' so v1 polling is used
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ protocol: '1', agent: '1.3.0' }),
    });
  });

  afterEach(() => {
    stopAgentNotifications();
    vi.useRealTimers();
  });

  it('starts and stops', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0); // flush detectProtocol
    await p;
    expect(isAgentNotificationsRunning()).toBe(true);

    stopAgentNotifications();
    expect(isAgentNotificationsRunning()).toBe(false);
  });

  it('does not poll immediately on start', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('polls after interval', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('shows toast when agent reports issues', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    await vi.advanceTimersByTimeAsync(5000);

    // Simulate connected -> send -> done with a warning
    mockHandler?.({ type: 'connected' });
    expect(mockSend).toHaveBeenCalled();

    mockHandler?.({ type: 'done', full_response: 'Node worker-3 memory at 95%, likely to hit pressure within 2 hours.' });

    // Allow promise microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      title: 'AI Insight',
      detail: expect.stringContaining('worker-3'),
    }));
  });

  it('does not show toast when agent says OK', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    await vi.advanceTimersByTimeAsync(5000);

    mockHandler?.({ type: 'connected' });
    mockHandler?.({ type: 'done', full_response: 'OK' });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('silently skips on error', async () => {
    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    await vi.advanceTimersByTimeAsync(5000);

    mockHandler?.({ type: 'error', message: 'Connection failed' });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('does not double-start', async () => {
    const p1 = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    const p2 = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p2;
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('detects protocol v2 and does not start polling', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ protocol: '2', agent: '2.0.0' }),
    });

    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;

    // v2 uses WebSocket monitor, not polling — so no AgentClient connect
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('handles agent unavailable gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const p = startAgentNotifications(5000);
    await vi.advanceTimersByTimeAsync(0);
    await p;

    // Should not start polling or crash
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(isAgentNotificationsRunning()).toBe(true);
  });
});
