// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => selector({
    addTab: vi.fn(),
    openCommandPalette: vi.fn(),
    connectionStatus: 'connected',
  }),
}));
vi.mock('../../hooks/useNavigateTab', () => ({ useNavigateTab: () => vi.fn() }));
vi.mock('../../hooks/useK8sListWatch', () => ({
  useK8sListWatch: ({ apiPath }: { apiPath: string }) => {
    if (apiPath.includes('nodes')) return { data: [
      { metadata: { name: 'node-1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
      { metadata: { name: 'node-2' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
    ], isLoading: false };
    return { data: [], isLoading: false };
  },
}));

import WelcomeView from '../WelcomeView';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderView() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><WelcomeView /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WelcomeView', () => {
  afterEach(() => { cleanup(); queryClient.clear(); });

  it('renders OpenShift Pulse title', () => {
    renderView();
    expect(screen.getByText('OpenShift Pulse')).toBeDefined();
  });

  it('shows the value proposition tagline', () => {
    renderView();
    expect(screen.getByText(/single pane of glass/)).toBeDefined();
  });

  it('shows connected cluster status pill with node count', () => {
    renderView();
    expect(screen.getByText(/Connected/)).toBeDefined();
    expect(screen.getByText(/2 nodes/)).toBeDefined();
  });

  it('shows Cluster Pulse as primary CTA at the top', () => {
    renderView();
    expect(screen.getByText('Cluster Pulse')).toBeDefined();
    expect(screen.getByText(/Risk score, attention items/)).toBeDefined();
  });

  it('shows quick nav row with Compute, Workloads, Administration, Alerts', () => {
    renderView();
    expect(screen.getAllByText('Compute').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Workloads').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Administration').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Alerts').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Readiness Checklist and Find Anything action cards', () => {
    renderView();
    expect(screen.getByText('Readiness Checklist')).toBeDefined();
    expect(screen.getByText('Find Anything')).toBeDefined();
  });

  it('shows remaining view tiles', () => {
    renderView();
    expect(screen.getByText('Software')).toBeDefined();
    expect(screen.getByText('Networking')).toBeDefined();
    expect(screen.getByText('Storage')).toBeDefined();
    expect(screen.getByText('Builds')).toBeDefined();
    expect(screen.getByText('Security')).toBeDefined();
    expect(screen.getByText('Access Control')).toBeDefined();
    expect(screen.getByText('CRDs')).toBeDefined();
  });

  it('shows Key Capabilities divider', () => {
    renderView();
    expect(screen.getByText('Key Capabilities')).toBeDefined();
  });

  it('renders first 6 feature showcase items (collapsed by default)', () => {
    renderView();
    expect(screen.getByText('YAML Editor')).toBeDefined();
    expect(screen.getByText('GitOps / ArgoCD')).toBeDefined();
    expect(screen.getByText('Incident Timeline')).toBeDefined();
    expect(screen.getByText('Health Audits')).toBeDefined();
    expect(screen.getByText('Security Audit')).toBeDefined();
    expect(screen.getByText('Rollback')).toBeDefined();
    // Hidden capabilities not visible until expanded
    expect(screen.queryByText('Pod Shell')).toBeNull();
    expect(screen.getByText(/Show all 12/)).toBeDefined();
  });

  it('renders feature descriptions', () => {
    renderView();
    expect(screen.getByText(/dry-run validation/)).toBeDefined();
    expect(screen.getByText(/auto-PR on save/)).toBeDefined();
    expect(screen.getByText(/77 automated checks/)).toBeDefined();
  });

  it('shows All Views divider', () => {
    renderView();
    expect(screen.getByText('All Views')).toBeDefined();
  });

  it('shows keyboard shortcuts', () => {
    renderView();
    expect(screen.getByText('Command Palette')).toBeDefined();
    expect(screen.getByText('Resource Browser')).toBeDefined();
    expect(screen.getByText('Navigate Table')).toBeDefined();
  });

  it('shows footer with GitHub link and version', () => {
    renderView();
    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeDefined();
    const link = screen.getByText('GitHub').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/alimobrem/OpenshiftPulse');
  });
});
