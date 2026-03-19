// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => selector({ selectedNamespace: '*', addTab: vi.fn() }),
}));
const mockData: Record<string, any[]> = {};
vi.mock('../../hooks/useK8sListWatch', () => ({
  useK8sListWatch: ({ apiPath }: { apiPath: string }) => ({ data: mockData[apiPath] || [], isLoading: false }),
}));
vi.mock('../../hooks/useNavigateTab', () => ({ useNavigateTab: () => vi.fn() }));
vi.mock('../../engine/query', () => ({ k8sList: vi.fn().mockResolvedValue([]), k8sGet: vi.fn().mockResolvedValue(null) }));
vi.mock('../../components/metrics/Sparkline', () => ({
  MetricCard: ({ title }: { title: string }) => <div data-testid="metric-card">{title}</div>,
}));
vi.mock('../../components/metrics/prometheus', () => ({ queryInstant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

import ComputeView from '../ComputeView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><ComputeView /></MemoryRouter></QueryClientProvider>);
}

describe('ComputeView', () => {
  afterEach(() => { cleanup(); Object.keys(mockData).forEach(k => delete mockData[k]); });

  it('renders page header', () => {
    renderView();
    expect(screen.getAllByText('Compute').length).toBeGreaterThanOrEqual(1);
  });

  it('shows cluster capacity stats', () => {
    renderView();
    expect(screen.getAllByText(/Total CPU/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Total Memory/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows metric cards', () => {
    renderView();
    expect(screen.getAllByTestId('metric-card').length).toBeGreaterThanOrEqual(4);
  });

  it('shows nodes table', () => {
    renderView();
    expect(screen.getAllByText(/Nodes/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders with node data', () => {
    mockData['/api/v1/nodes'] = [{
      metadata: { name: 'node-1', uid: '1', labels: { 'node-role.kubernetes.io/worker': '' }, creationTimestamp: '2025-01-01T00:00:00Z' },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        allocatable: { cpu: '4', memory: '16Gi', pods: '250' },
        capacity: { cpu: '4', memory: '16Gi' },
        nodeInfo: { kubeletVersion: 'v1.28.0', osImage: 'RHCOS', containerRuntimeVersion: 'cri-o://1.28' },
      },
    }];
    renderView();
    expect(screen.getAllByText('node-1').length).toBeGreaterThanOrEqual(1);
  });
});
