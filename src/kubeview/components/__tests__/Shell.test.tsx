// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Outlet: () => <div data-testid="outlet">outlet-content</div>,
  };
});

const _mockUIState: Record<string, any> = {
  commandPaletteOpen: false,
  browserOpen: false,
  dockPanel: null,
  impersonateUser: null,
  clearImpersonation: vi.fn(),
  degradedReasons: new Set(),
  selectedNamespace: '*',
  addTab: vi.fn(),
  addToast: vi.fn(),
  tabs: [],
  activeTabId: null,
  closeTab: vi.fn(),
  setActiveTab: vi.fn(),
  reorderTabs: vi.fn(),
  namespaces: [],
  setNamespace: vi.fn(),
  toggleCommandPalette: vi.fn(),
  toggleBrowser: vi.fn(),
  openDock: vi.fn(),
  closeDock: vi.fn(),
  dockHeight: 250,
  setDockHeight: vi.fn(),
  toasts: [],
  removeToast: vi.fn(),
  isHyperShift: false,
};

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => selector(_mockUIState),
}));

vi.mock('../../store/monitorStore', () => ({
  useMonitorStore: Object.assign(
    (selector: any) => {
      const state = {
        notificationCenterOpen: false,
        toggleNotificationCenter: vi.fn(),
      };
      return selector(state);
    },
    { getState: () => ({ toggleNotificationCenter: vi.fn() }) },
  ),
}));

vi.mock('../../hooks', () => ({
  useKeyboardShortcuts: vi.fn(),
  useDiscovery: vi.fn(),
}));
vi.mock('../../hooks/useCapabilityDetection', () => ({
  useCapabilityDetection: vi.fn(),
}));
vi.mock('../../engine/enhancers/register', () => ({
  registerBuiltinEnhancers: vi.fn(),
}));
vi.mock('../../engine/agentNotifications', () => ({
  startAgentNotifications: vi.fn(),
  stopAgentNotifications: vi.fn(),
}));
vi.mock('../CommandBar', () => ({
  CommandBar: () => <div data-testid="command-bar">CommandBar</div>,
}));
vi.mock('../TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar">TabBar</div>,
}));
vi.mock('../Dock', () => ({
  Dock: () => <div data-testid="dock">Dock</div>,
}));
vi.mock('../StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">StatusBar</div>,
}));
vi.mock('../CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette">CommandPalette</div>,
}));
vi.mock('../ResourceBrowser', () => ({
  ResourceBrowser: () => <div data-testid="resource-browser">ResourceBrowser</div>,
}));
vi.mock('../feedback/Toast', () => ({
  ToastContainer: () => null,
}));
vi.mock('../agent/NotificationCenter', () => ({
  NotificationCenter: () => null,
}));
vi.mock('../ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => <>{children}</>,
  CssHealthCheck: () => null,
}));
vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

import { Shell } from '../Shell';

function renderShell() {
  return render(
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  );
}

describe('Shell', () => {
  afterEach(() => {
    cleanup();
    _mockUIState.commandPaletteOpen = false;
    _mockUIState.browserOpen = false;
    _mockUIState.dockPanel = null;
    _mockUIState.impersonateUser = null;
  });

  it('renders CommandBar, TabBar, StatusBar, and Outlet', () => {
    renderShell();
    expect(screen.getByTestId('command-bar')).toBeDefined();
    expect(screen.getByTestId('tab-bar')).toBeDefined();
    expect(screen.getByTestId('status-bar')).toBeDefined();
    expect(screen.getByTestId('outlet')).toBeDefined();
  });

  it('does not render Dock when dockPanel is null', () => {
    renderShell();
    expect(screen.queryByTestId('dock')).toBeNull();
  });

  it('renders Dock when dockPanel is set', () => {
    _mockUIState.dockPanel = 'logs';
    renderShell();
    expect(screen.getByTestId('dock')).toBeDefined();
  });

  it('renders impersonation banner when impersonateUser is set', () => {
    _mockUIState.impersonateUser = 'test-admin';
    renderShell();
    expect(screen.getByText(/Impersonating/)).toBeDefined();
    expect(screen.getByText('test-admin')).toBeDefined();
    expect(screen.getByText('Stop')).toBeDefined();
  });

  it('does not render CommandPalette when closed', () => {
    renderShell();
    expect(screen.queryByTestId('command-palette')).toBeNull();
  });

  it('renders session expired modal when session_expired is in degradedReasons', () => {
    _mockUIState.degradedReasons = new Set(['session_expired']);
    renderShell();
    expect(screen.getByText('Session Expired')).toBeDefined();
    expect(screen.getByText('Your OAuth token has expired')).toBeDefined();
    expect(screen.getByText('Re-authenticate')).toBeDefined();
    expect(screen.getByText('Dismiss')).toBeDefined();
    _mockUIState.degradedReasons = new Set();
  });

  it('does not render session expired modal when no session_expired reason', () => {
    _mockUIState.degradedReasons = new Set();
    renderShell();
    expect(screen.queryByText('Session Expired')).toBeNull();
  });

  it('does not render session expired modal for other degraded reasons', () => {
    _mockUIState.degradedReasons = new Set(['agent_unreachable']);
    renderShell();
    expect(screen.queryByText('Session Expired')).toBeNull();
    _mockUIState.degradedReasons = new Set();
  });
});
