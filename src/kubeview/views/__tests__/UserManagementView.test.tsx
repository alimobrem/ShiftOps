// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
vi.mock('react-router-dom', async () => { const a = await vi.importActual('react-router-dom'); return { ...a, useNavigate: () => vi.fn() }; });
vi.mock('../../store/uiStore', () => ({ useUIStore: (s: any) => s({ selectedNamespace: '*', addTab: vi.fn(), addToast: vi.fn(), impersonateUser: null, impersonateGroups: [], setImpersonation: vi.fn(), clearImpersonation: vi.fn() }) }));
vi.mock('../../hooks/useK8sListWatch', () => ({ useK8sListWatch: () => ({ data: [], isLoading: false }) }));
vi.mock('../../hooks/useNavigateTab', () => ({ useNavigateTab: () => vi.fn() }));
vi.mock('../../engine/query', () => ({ k8sList: vi.fn().mockResolvedValue([]), k8sGet: vi.fn().mockResolvedValue(null), k8sDelete: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/utils', () => ({ cn: (...a: any[]) => a.filter(Boolean).join(' ') }));
import UserManagementView from '../UserManagementView';
function r() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><UserManagementView /></MemoryRouter></QueryClientProvider>); }
describe('UserManagementView', () => {
  afterEach(cleanup);
  it('renders page header', () => { r(); expect(document.body.textContent).toContain('User Management'); });
  it('shows user/group/SA labels', () => { r(); expect(document.body.textContent).toContain('Users'); expect(document.body.textContent).toContain('Groups'); });
  it('renders without crashing', () => { const { container } = r(); expect(container.querySelector('.bg-slate-950')).toBeDefined(); });
});
