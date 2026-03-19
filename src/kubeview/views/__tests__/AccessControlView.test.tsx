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
vi.mock('@/lib/utils', () => ({ cn: (...a: any[]) => a.filter(Boolean).join(' ') }));
import AccessControlView from '../AccessControlView';
function r() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AccessControlView /></MemoryRouter></QueryClientProvider>); }
describe('AccessControlView', () => {
  afterEach(cleanup);
  it('renders page header', () => { r(); expect(document.body.textContent).toContain('Access Control'); });
  it('renders without crashing', () => { const { container } = r(); expect(container.querySelector('.bg-slate-950')).toBeDefined(); });
  it('shows RBAC resource labels', () => { r(); expect(document.body.textContent).toContain('Roles'); expect(document.body.textContent).toContain('ClusterRoles'); });
});
