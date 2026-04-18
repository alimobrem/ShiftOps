// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

vi.mock('zustand/react/shallow', () => ({
  useShallow: (fn: any) => fn,
}));

vi.mock('../../store/monitorStore', () => ({
  useMonitorStore: (selector: any) => {
    const state = {
      connected: false,
      connectionError: null,
      monitorEnabled: true,
      setMonitorEnabled: vi.fn(),
      triggerScan: vi.fn(),
      lastScanTime: null,
      findings: [],
      pendingActions: [],
    };
    return selector(state);
  },
}));

vi.mock('../../hooks/useIncidentFeed', () => ({
  useIncidentFeed: () => ({
    incidents: [],
    isLoading: false,
    counts: { critical: 0, warning: 0, info: 0, total: 0 },
  }),
}));

vi.mock('../../store/uiStore', () => ({
  useUIStore: Object.assign(
    (selector: any) => {
      const state = { addToast: vi.fn() };
      return selector(state);
    },
    { getState: () => ({ addToast: vi.fn() }) },
  ),
}));

vi.mock('../../store/trustStore', () => ({
  useTrustStore: (selector: any) => {
    const state = {
      trustLevel: 0,
      setTrustLevel: vi.fn(),
      autoFixCategories: [],
      setAutoFixCategories: vi.fn(),
    };
    return selector(state);
  },
}));

vi.mock('../../engine/evalStatus', () => ({
  fetchAgentEvalStatus: vi.fn().mockResolvedValue(null),
}));

vi.mock('../incidents/NowTab', () => ({
  NowTab: () => <div data-testid="now-tab">NowTab</div>,
}));

vi.mock('../incidents/InvestigateTab', () => ({
  InvestigateTab: () => <div data-testid="investigate-tab">InvestigateTab</div>,
}));

vi.mock('../incidents/HistoryTab', () => ({
  HistoryTab: () => <div data-testid="history-tab">HistoryTab</div>,
}));

vi.mock('../AlertsView', () => ({
  default: () => <div data-testid="alerts-view">AlertsView</div>,
}));

import IncidentCenterView from '../IncidentCenterView';

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderView() {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: '', href: 'http://localhost/incidents' },
    writable: true,
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <IncidentCenterView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('IncidentCenterView', () => {
  afterEach(cleanup);

  it('renders page header', () => {
    renderView();
    expect(screen.getByText('Incident Center')).toBeDefined();
  });

  it('renders subtitle', () => {
    renderView();
    expect(screen.getByText(/Real-time incidents, correlation analysis/)).toBeDefined();
  });

  it('renders all 5 tab buttons', () => {
    renderView();
    expect(screen.getByRole('tab', { name: /Active/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Timeline/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Review Queue/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /History/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Alerts/ })).toBeDefined();
  });

  it('shows Now tab content by default', () => {
    renderView();
    expect(screen.getByTestId('now-tab')).toBeDefined();
  });

  it('shows connection status indicator', () => {
    renderView();
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('has Pulse Agent button linking to /agent', () => {
    renderView();
    expect(screen.getByTitle('Pulse Agent')).toBeDefined();
  });

  it('has tablist role for accessibility', () => {
    renderView();
    expect(screen.getByRole('tablist', { name: /Incident Center tabs/ })).toBeDefined();
  });

  it('has settings button linking to agent page', () => {
    renderView();
    expect(screen.getByTitle('Pulse Agent')).toBeDefined();
  });
});
