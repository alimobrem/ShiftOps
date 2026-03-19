// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
vi.mock('react-router-dom', async () => { const a = await vi.importActual('react-router-dom'); return { ...a, useNavigate: () => vi.fn() }; });
vi.mock('../../store/uiStore', () => ({ useUIStore: (s: any) => s({ selectedNamespace: '*', addTab: vi.fn() }) }));
vi.mock('../../hooks/useK8sListWatch', () => ({ useK8sListWatch: () => ({ data: [], isLoading: false }) }));
vi.mock('../../hooks/useNavigateTab', () => ({ useNavigateTab: () => vi.fn() }));
vi.mock('../../engine/query', () => ({ k8sList: vi.fn().mockResolvedValue([]), k8sGet: vi.fn().mockResolvedValue(null) }));
vi.mock('../../components/metrics/Sparkline', () => ({ MetricCard: ({ title }: { title: string }) => <div data-testid="metric-card">{title}</div> }));
vi.mock('../../components/metrics/prometheus', () => ({ queryInstant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/utils', () => ({ cn: (...a: any[]) => a.filter(Boolean).join(' ') }));
import NetworkingView from '../NetworkingView';
function r() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NetworkingView /></MemoryRouter></QueryClientProvider>); }
describe('NetworkingView', () => {
  afterEach(cleanup);
  it('renders page header', () => { r(); expect(document.body.textContent).toContain('Networking'); });
  it('shows metric cards', () => { r(); expect(screen.getAllByTestId('metric-card').length).toBeGreaterThanOrEqual(4); });
  it('shows services and routes labels', () => { r(); expect(document.body.textContent).toContain('Services'); expect(document.body.textContent).toContain('Routes'); });
  it('renders without crashing', () => { const { container } = r(); expect(container.querySelector('.bg-slate-950')).toBeDefined(); });
});
