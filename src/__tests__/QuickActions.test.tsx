// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Shared mocks ---
const navigateMock = vi.fn();
const addToastMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/store/useUIStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: addToastMock, sidebarCollapsed: false }),
}));

// --- Pod tests ---
describe('Pods Quick Actions', () => {
  const restartPodMock = vi.fn();
  const deletePodMock = vi.fn();

  const mockPods = [
    { name: 'nginx-1', namespace: 'default', status: 'Running', restarts: 0 },
    { name: 'redis-1', namespace: 'prod', status: 'Failed', restarts: 3 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('@/store/useClusterStore', () => ({
      useClusterStore: (selector?: (s: Record<string, unknown>) => unknown) => {
        const state: Record<string, unknown> = {
          pods: mockPods, fetchClusterData: vi.fn(), restartPod: restartPodMock,
          deletePod: deletePodMock, selectedNamespace: 'all', namespaces: [],
          deployments: [], services: [], nodes: [], setSelectedNamespace: vi.fn(),
        };
        return selector ? selector(state) : state;
      },
    }));
  });

  afterEach(() => { cleanup(); vi.resetModules(); });

  it('renders inline Logs and Restart buttons', async () => {
    // Re-import after mock
    const { default: PodsPage } = await import('../pages/workloads/Pods');
    render(<MemoryRouter><PodsPage /></MemoryRouter>);
    const logsButtons = screen.getAllByText('Logs');
    expect(logsButtons.length).toBe(2);
    const restartButtons = screen.getAllByText('Restart');
    expect(restartButtons.length).toBe(2);
  });

  it('Logs button navigates to pod detail with logs tab', async () => {
    const { default: PodsPage } = await import('../pages/workloads/Pods');
    render(<MemoryRouter><PodsPage /></MemoryRouter>);
    const logsButtons = screen.getAllByText('Logs');
    fireEvent.click(logsButtons[0]);
    expect(navigateMock).toHaveBeenCalledWith('/workloads/pods/default/nginx-1?tab=logs');
  });

  it('Restart button calls restartPod and shows toast', async () => {
    const { default: PodsPage } = await import('../pages/workloads/Pods');
    render(<MemoryRouter><PodsPage /></MemoryRouter>);
    const restartButtons = screen.getAllByText('Restart');
    fireEvent.click(restartButtons[0]);
    expect(restartPodMock).toHaveBeenCalledWith('default', 'nginx-1');
    expect(addToastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Restarting nginx-1' }));
  });
});

// --- Node tests ---
describe('Nodes Cordon/Uncordon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => { cleanup(); vi.resetModules(); });

  it('renders Cordon button for schedulable nodes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          metadata: { name: 'node-1', creationTimestamp: '2024-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/worker': '' } },
          spec: { unschedulable: false },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            nodeInfo: { kubeletVersion: 'v1.28' },
            addresses: [{ type: 'InternalIP', address: '10.0.0.1' }],
            capacity: { cpu: '4', memory: '16Gi' },
            allocatable: { cpu: '3800m', memory: '15Gi' },
          },
        }],
      }),
    });

    // Need fresh import since useK8sResource uses the cluster store
    vi.doMock('@/store/useClusterStore', () => ({
      useClusterStore: (selector?: (s: Record<string, unknown>) => unknown) => {
        const state: Record<string, unknown> = { selectedNamespace: 'all', setSelectedNamespace: vi.fn() };
        return selector ? selector(state) : state;
      },
    }));

    const { default: NodesPage } = await import('../pages/compute/Nodes');
    render(<MemoryRouter><NodesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('node-1')).toBeDefined();
      expect(screen.getByText('Cordon')).toBeDefined();
    });
  });

  it('renders Uncordon button for cordoned nodes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          metadata: { name: 'node-2', creationTimestamp: '2024-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/worker': '' } },
          spec: { unschedulable: true },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            nodeInfo: { kubeletVersion: 'v1.28' },
            addresses: [{ type: 'InternalIP', address: '10.0.0.2' }],
            capacity: { cpu: '4', memory: '16Gi' },
            allocatable: { cpu: '3800m', memory: '15Gi' },
          },
        }],
      }),
    });

    vi.doMock('@/store/useClusterStore', () => ({
      useClusterStore: (selector?: (s: Record<string, unknown>) => unknown) => {
        const state: Record<string, unknown> = { selectedNamespace: 'all', setSelectedNamespace: vi.fn() };
        return selector ? selector(state) : state;
      },
    }));

    const { default: NodesPage } = await import('../pages/compute/Nodes');
    render(<MemoryRouter><NodesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('node-2')).toBeDefined();
      expect(screen.getByText('Uncordon')).toBeDefined();
      // Status should show cordoned
      expect(screen.getByText(/Cordoned/)).toBeDefined();
    });
  });
});
