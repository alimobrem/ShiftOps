// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => {
    const state = { selectedNamespace: '*', addTab: vi.fn(), addToast: vi.fn() };
    return selector(state);
  },
}));

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

import MonitorView from '../MonitorView';

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MonitorView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MonitorView', () => {
  afterEach(() => { cleanup(); });

  it('renders the page header', () => {
    renderView();
    expect(screen.getByText('Monitor')).toBeDefined();
    expect(screen.getByText(/SRE command center/)).toBeDefined();
  });

  it('renders all three tabs', () => {
    renderView();
    expect(screen.getByText('Live Status')).toBeDefined();
    expect(screen.getByText('Fix History')).toBeDefined();
    expect(screen.getByText('Configuration')).toBeDefined();
  });

  it('shows Live Status tab by default with severity cards', () => {
    renderView();
    expect(screen.getByText('Critical')).toBeDefined();
    expect(screen.getByText('Warning')).toBeDefined();
    expect(screen.getByText('Info')).toBeDefined();
  });

  it('shows empty state on Live Status tab', () => {
    renderView();
    expect(screen.getByText('All clear')).toBeDefined();
  });

  it('switches to Fix History tab', () => {
    renderView();
    fireEvent.click(screen.getByText('Fix History'));
    expect(screen.getByText('No actions taken yet')).toBeDefined();
    expect(screen.getByPlaceholderText('Search history...')).toBeDefined();
  });

  it('switches to Configuration tab', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    expect(screen.getByText('Trust Level')).toBeDefined();
    expect(screen.getByText('Scan Now')).toBeDefined();
  });

  it('shows monitor enable/disable toggle on config tab', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles monitor on/off', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('shows all five trust levels', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    expect(screen.getByText(/Monitor Only/)).toBeDefined();
    expect(screen.getByText(/Level 1: Suggest/)).toBeDefined();
    expect(screen.getByText(/Ask First/)).toBeDefined();
    expect(screen.getByText(/Auto-fix Safe/)).toBeDefined();
    expect(screen.getByText(/Full Auto/)).toBeDefined();
  });

  it('selects a trust level', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    fireEvent.click(screen.getByText(/Full Auto/));
    // Auto-fix categories should appear at level 4
    expect(screen.getByText('Auto-fix Categories')).toBeDefined();
    expect(screen.getByText('CrashLoopBackOff')).toBeDefined();
    expect(screen.getByText('Resource Limits')).toBeDefined();
    expect(screen.getByText('Certificate Expiry')).toBeDefined();
  });

  it('hides auto-fix categories below level 4', () => {
    renderView();
    fireEvent.click(screen.getByText('Configuration'));
    // Default trust level is 0, so auto-fix categories should not be visible
    expect(screen.queryByText('Auto-fix Categories')).toBeNull();
  });

  it('shows disconnected status by default', () => {
    renderView();
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('shows connection status indicator', () => {
    renderView();
    // The connection status badge is always visible
    const badge = screen.getByText('Disconnected');
    expect(badge.className).toContain('text-slate-400');
  });

  it('renders tab list with correct ARIA attributes', () => {
    renderView();
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });
});
