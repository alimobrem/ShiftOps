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

import StorageView from '../StorageView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><StorageView /></MemoryRouter></QueryClientProvider>);
}

describe('StorageView', () => {
  afterEach(() => { cleanup(); Object.keys(mockData).forEach(k => delete mockData[k]); });

  it('renders page header', () => {
    renderView();
    expect(document.body.textContent).toContain('Storage');
  });

  it('shows stat cards', () => {
    renderView();
    expect(document.body.textContent).toContain('PVCs');
    expect(document.body.textContent).toContain('Persistent Volumes');
    expect(document.body.textContent).toContain('Storage Classes');
  });

  it('shows metric cards', () => {
    renderView();
    expect(screen.getAllByTestId('metric-card').length).toBeGreaterThanOrEqual(2);
  });

  it('shows storage classes panel', () => {
    renderView();
    expect(document.body.textContent).toMatch(/Storage Classes/);
  });

  it('shows CSI drivers section', () => {
    renderView();
    expect(document.body.textContent).toMatch(/CSI Drivers/);
  });

  it('renders page with no data without crashing', () => {
    const { container } = renderView();
    expect(container.querySelector('.bg-slate-950')).toBeDefined();
  });
});
