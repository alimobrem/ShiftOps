// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pods from '../pages/workloads/Pods';

const navigateMock = vi.fn();
const addToastMock = vi.fn();

const mockPods = [
  { name: 'nginx-abc', namespace: 'default', status: 'Running', restarts: 0 },
  { name: 'redis-xyz', namespace: 'monitoring', status: 'Running', restarts: 1 },
];

vi.mock('@/store/useUIStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: addToastMock }),
}));

const storeState: Record<string, unknown> = {
  pods: mockPods,
  fetchClusterData: vi.fn(),
  restartPod: vi.fn(),
  deletePod: vi.fn(),
  selectedNamespace: 'all',
  namespaces: [],
  setSelectedNamespace: vi.fn(),
};

vi.mock('@/store/useClusterStore', () => ({
  useClusterStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPods() {
  return render(
    <MemoryRouter>
      <Pods />
    </MemoryRouter>,
  );
}

describe('Pods page', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    addToastMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders pod list', () => {
    renderPods();
    expect(screen.getByText('nginx-abc')).toBeDefined();
    expect(screen.getByText('redis-xyz')).toBeDefined();
  });

  it('View Logs navigates to pod detail with logs tab', async () => {
    renderPods();

    // Open the kebab menu for the first pod
    const actionButtons = screen.getAllByLabelText('Actions');
    fireEvent.click(actionButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('View Logs')).toBeDefined();
    });

    fireEvent.click(screen.getByText('View Logs'));

    expect(navigateMock).toHaveBeenCalledWith('/workloads/pods/default/nginx-abc?tab=logs');
  });

  it('View Logs does not show a stub toast', async () => {
    renderPods();

    const actionButtons = screen.getAllByLabelText('Actions');
    fireEvent.click(actionButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('View Logs')).toBeDefined();
    });

    fireEvent.click(screen.getByText('View Logs'));

    // Should NOT have called addToast — it navigates instead
    expect(addToastMock).not.toHaveBeenCalled();
  });
});
