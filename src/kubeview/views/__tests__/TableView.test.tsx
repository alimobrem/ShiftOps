// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// --- Mocks (vi.mock is hoisted before imports) ---

const navigateMock = vi.fn();
const addTabMock = vi.fn();
const addToastMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../store/uiStore', () => ({
  useUIStore: Object.assign(
    (selector: any) => {
      const state = {
        selectedNamespace: '*',
        addTab: addTabMock,
        addToast: addToastMock,
        setConnectionStatus: vi.fn(),
      };
      return selector(state);
    },
    {
      getState: () => ({
        setSelectedNamespace: vi.fn(),
      }),
    },
  ),
}));

vi.mock('../../store/clusterStore', () => ({
  useClusterStore: (selector: any) => {
    const state = { resourceRegistry: null };
    return selector(state);
  },
}));

// Shared mock state for useK8sListWatch
const _mockWatchResult: { data: any[]; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};

vi.mock('../../hooks/useK8sListWatch', () => ({
  useK8sListWatch: () => _mockWatchResult,
}));

vi.mock('../../engine/query', () => ({
  k8sPatch: vi.fn().mockResolvedValue({}),
  k8sDelete: vi.fn().mockResolvedValue({}),
  k8sList: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../hooks/useResourceUrl', () => ({
  buildApiPathFromResource: (r: any) =>
    `/api/v1/namespaces/${r.metadata?.namespace ?? 'default'}/${r.kind?.toLowerCase() ?? 'resources'}/${r.metadata?.name ?? 'unknown'}`,
}));

vi.mock('../../engine/yamlUtils', () => ({
  jsonToYaml: (obj: any) => JSON.stringify(obj, null, 2),
}));

vi.mock('../../components/feedback/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, onConfirm, onClose }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('../../components/DeployProgress', () => ({
  default: () => <div data-testid="deploy-progress" />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Now import the component
import TableView from '../TableView';

// --- Helpers ---

function setMockWatch(result: { data: any[]; isLoading: boolean; error: Error | null }) {
  _mockWatchResult.data = result.data;
  _mockWatchResult.isLoading = result.isLoading;
  _mockWatchResult.error = result.error;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderTable(gvrKey = 'v1/pods') {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TableView gvrKey={gvrKey} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makePodResource(name: string, namespace = 'default') {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: `uid-${name}`,
      creationTimestamp: '2025-01-01T00:00:00Z',
      labels: {},
    },
    spec: {},
    status: { phase: 'Running', containerStatuses: [{ name: 'main', ready: true, restartCount: 0, state: { running: {} } }] },
  };
}

// --- Tests ---

describe('TableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockWatch({ data: [], isLoading: false, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders resource list with correct columns', () => {
    setMockWatch({
      data: [makePodResource('web-1'), makePodResource('api-1', 'kube-system')],
      isLoading: false,
      error: null,
    });

    renderTable('v1/pods');

    // Header should show the resource kind
    expect(screen.getByText('Pods')).toBeDefined();

    // Default columns
    expect(screen.getByText('Name')).toBeDefined();
    expect(screen.getByText('Namespace')).toBeDefined();
    expect(screen.getByText('Age')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();

    // Resource names
    expect(screen.getByText('web-1')).toBeDefined();
    expect(screen.getByText('api-1')).toBeDefined();
  });

  it('shows per-row delete button', () => {
    setMockWatch({
      data: [makePodResource('target-pod')],
      isLoading: false,
      error: null,
    });

    renderTable('v1/pods');

    const deleteButtons = screen.getAllByTitle('Delete');
    expect(deleteButtons.length).toBe(1);
  });

  it('shows bulk delete button when rows are selected', () => {
    setMockWatch({
      data: [makePodResource('pod-a'), makePodResource('pod-b')],
      isLoading: false,
      error: null,
    });

    renderTable('v1/pods');

    // No bulk delete button initially
    expect(screen.queryByText(/Delete \d/)).toBeNull();

    // Select all via the header checkbox (first checkbox)
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // Now bulk delete button should appear with count
    expect(screen.getByText('Delete 2')).toBeDefined();
  });

  it('handles empty state', () => {
    setMockWatch({
      data: [],
      isLoading: false,
      error: null,
    });

    renderTable('v1/pods');

    expect(screen.getByText(/No pods found/i)).toBeDefined();
  });

  it('shows loading state', () => {
    setMockWatch({
      data: [],
      isLoading: true,
      error: null,
    });

    renderTable('v1/pods');

    // Skeleton loading state renders animated placeholders
    expect(document.querySelector('.animate-pulse')).toBeDefined();
  });

  it('shows error state', () => {
    setMockWatch({
      data: [],
      isLoading: false,
      error: new Error('Forbidden'),
    });

    renderTable('v1/pods');

    expect(screen.getByText('Error loading resources')).toBeDefined();
    expect(screen.getByText('Forbidden')).toBeDefined();
  });

  it('renders correct resource kind from gvrKey', () => {
    setMockWatch({
      data: [],
      isLoading: false,
      error: null,
    });

    renderTable('apps/v1/deployments');

    expect(screen.getByText('Deployments')).toBeDefined();
    expect(screen.getByText(/apps\/v1/)).toBeDefined();
  });

  it('shows "found" count matching resource count', () => {
    setMockWatch({
      data: [makePodResource('p1'), makePodResource('p2'), makePodResource('p3')],
      isLoading: false,
      error: null,
    });

    renderTable('v1/pods');

    expect(screen.getByText(/3 found/)).toBeDefined();
  });

  it('shows Create button', () => {
    setMockWatch({ data: [], isLoading: false, error: null });

    renderTable('v1/pods');

    expect(screen.getByText('Create')).toBeDefined();
  });
});
