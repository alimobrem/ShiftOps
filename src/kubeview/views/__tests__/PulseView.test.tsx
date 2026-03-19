// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigateMock = vi.fn();
const addTabMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => {
    const state = {
      selectedNamespace: '*',
      addTab: addTabMock,
      setConnectionStatus: vi.fn(),
      addToast: vi.fn(),
    };
    return selector(state);
  },
}));

const _mockListWatchData: Record<string, { data: any[]; isLoading: boolean }> = {};

vi.mock('../../hooks/useK8sListWatch', () => ({
  useK8sListWatch: ({ apiPath }: { apiPath: string }) => {
    const entry = _mockListWatchData[apiPath] ?? { data: [], isLoading: false };
    return { data: entry.data, isLoading: entry.isLoading };
  },
}));

vi.mock('../../hooks/useNavigateTab', () => ({
  useNavigateTab: () => vi.fn(),
}));

vi.mock('../../engine/query', () => ({
  k8sGet: vi.fn().mockResolvedValue(null),
  k8sList: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../components/metrics/prometheus', () => ({
  queryInstant: vi.fn().mockResolvedValue([]),
  queryRange: vi.fn().mockResolvedValue([]),
  getTimeRange: vi.fn().mockReturnValue([0, 1]),
}));

vi.mock('../../components/metrics/Sparkline', () => ({
  MetricCard: ({ title }: { title: string }) => <div data-testid="metric-card">{title}</div>,
  Sparkline: () => <div data-testid="sparkline" />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../engine/gvr', () => ({
  resourceDetailUrl: (r: any) => `/r/v1~pods/${r.metadata?.namespace}/${r.metadata?.name}`,
}));

import PulseView from '../PulseView';

function setMockData(data: Record<string, { data: any[]; isLoading: boolean }>) {
  for (const key of Object.keys(_mockListWatchData)) {
    delete _mockListWatchData[key];
  }
  Object.assign(_mockListWatchData, data);
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderPulse(tab: string = 'issues') {
  const queryClient = createQueryClient();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: `?tab=${tab}`, href: `http://localhost/pulse?tab=${tab}` },
    writable: true,
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PulseView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makePod(name: string, phase: string, opts?: {
  namespace?: string;
  containerState?: Record<string, unknown>;
  ownerKind?: string;
  uid?: string;
}) {
  const containerStatuses = opts?.containerState
    ? [{ name: 'main', ready: false, restartCount: 5, state: opts.containerState }]
    : phase === 'Running'
    ? [{ name: 'main', ready: true, restartCount: 0, state: { running: {} } }]
    : [];

  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: opts?.namespace ?? 'default',
      uid: opts?.uid ?? `uid-${name}`,
      ownerReferences: opts?.ownerKind
        ? [{ kind: opts.ownerKind, name: 'owner', uid: 'owner-uid', apiVersion: 'v1' }]
        : [],
    },
    spec: {},
    status: { phase, containerStatuses },
  };
}

function makeNode(name: string, ready: boolean) {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name, uid: `uid-${name}`, labels: {} },
    spec: {},
    status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
  };
}

function makeDeployment(name: string, ready: number, desired: number) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, namespace: 'default', uid: `uid-${name}` },
    spec: { replicas: desired },
    status: { readyReplicas: ready, availableReplicas: ready },
  };
}

function makeOperator(name: string, degraded: boolean) {
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'ClusterOperator',
    metadata: { name, uid: `uid-${name}` },
    status: {
      conditions: degraded
        ? [{ type: 'Degraded', status: 'True', message: `${name} is degraded` }]
        : [{ type: 'Available', status: 'True' }],
    },
  };
}

describe('PulseView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockData({});
  });

  afterEach(cleanup);

  it('renders header with Cluster Pulse title', () => {
    renderPulse('report');
    expect(screen.getByText('Cluster Pulse')).toBeDefined();
  });

  it('renders 3 tabs: Report, Issues, Runbooks', () => {
    renderPulse('report');
    expect(screen.getByText('Report')).toBeDefined();
    expect(screen.getByText(/Issues/)).toBeDefined();
    expect(screen.getByText('Runbooks')).toBeDefined();
  });

  it('shows "No issues detected" on Issues tab when healthy', () => {
    setMockData({
      '/api/v1/nodes': { data: [makeNode('node-1', true)], isLoading: false },
      '/api/v1/pods': { data: [makePod('pod-1', 'Running')], isLoading: false },
      '/apis/apps/v1/deployments': { data: [makeDeployment('d1', 1, 1)], isLoading: false },
      '/api/v1/persistentvolumeclaims': { data: [], isLoading: false },
      '/apis/config.openshift.io/v1/clusteroperators': { data: [makeOperator('auth', false)], isLoading: false },
    });

    renderPulse('issues');
    expect(screen.getByText('No issues detected')).toBeDefined();
  });

  it('shows diagnosed CrashLoopBackOff pod on Issues tab', () => {
    const crashPod = makePod('crash-pod', 'Running', {
      containerState: { waiting: { reason: 'CrashLoopBackOff' } },
    });

    setMockData({
      '/api/v1/nodes': { data: [makeNode('node-1', true)], isLoading: false },
      '/api/v1/pods': { data: [crashPod], isLoading: false },
      '/apis/apps/v1/deployments': { data: [], isLoading: false },
      '/api/v1/persistentvolumeclaims': { data: [], isLoading: false },
      '/apis/config.openshift.io/v1/clusteroperators': { data: [], isLoading: false },
    });

    renderPulse('issues');
    expect(screen.getByText('crash-pod')).toBeDefined();
  });

  it('shows runbooks with affected count', () => {
    const crashPod = makePod('crash-pod', 'Running', {
      containerState: { waiting: { reason: 'CrashLoopBackOff' } },
    });

    setMockData({
      '/api/v1/nodes': { data: [makeNode('node-1', true)], isLoading: false },
      '/api/v1/pods': { data: [crashPod], isLoading: false },
      '/apis/apps/v1/deployments': { data: [], isLoading: false },
      '/api/v1/persistentvolumeclaims': { data: [], isLoading: false },
      '/apis/config.openshift.io/v1/clusteroperators': { data: [], isLoading: false },
    });

    renderPulse('runbooks');
    expect(screen.getByText('Pod CrashLoopBackOff')).toBeDefined();
    expect(screen.getByText('1 affected')).toBeDefined();
  });

  it('excludes installer pods from diagnosis', () => {
    const installerPod = makePod('installer-1-node-1', 'Failed', { ownerKind: 'Job' });

    setMockData({
      '/api/v1/nodes': { data: [], isLoading: false },
      '/api/v1/pods': { data: [installerPod], isLoading: false },
      '/apis/apps/v1/deployments': { data: [], isLoading: false },
      '/api/v1/persistentvolumeclaims': { data: [], isLoading: false },
      '/apis/config.openshift.io/v1/clusteroperators': { data: [], isLoading: false },
    });

    renderPulse('issues');
    expect(screen.getByText('No issues detected')).toBeDefined();
  });

  it('renders metric sparkline cards on Report tab', () => {
    setMockData({
      '/api/v1/nodes': { data: [], isLoading: false },
      '/api/v1/pods': { data: [], isLoading: false },
      '/apis/apps/v1/deployments': { data: [], isLoading: false },
      '/api/v1/persistentvolumeclaims': { data: [], isLoading: false },
      '/apis/config.openshift.io/v1/clusteroperators': { data: [], isLoading: false },
    });

    renderPulse('report');
    const cards = screen.getAllByTestId('metric-card');
    expect(cards.length).toBe(4);
  });
});
