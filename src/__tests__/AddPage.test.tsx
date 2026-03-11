// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddPage from '../pages/developer/AddPage';

const addToastMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/store/useUIStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: addToastMock }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderAddPage() {
  return render(
    <MemoryRouter>
      <AddPage />
    </MemoryRouter>,
  );
}

describe('AddPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    addToastMock.mockClear();
    navigateMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all add options', () => {
    renderAddPage();
    expect(screen.getByText('From Git')).toBeDefined();
    expect(screen.getByText('Container Image')).toBeDefined();
    expect(screen.getByText('YAML')).toBeDefined();
    expect(screen.getByText('Helm Chart')).toBeDefined();
  });

  it('opens YAML dialog when YAML option is selected', async () => {
    renderAddPage();
    const buttons = screen.getAllByText('Select');
    // YAML is the 5th option (index 4)
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeDefined();
      expect(screen.getByPlaceholderText(/apiVersion/)).toBeDefined();
    });
  });

  it('YAML dialog Apply button is disabled when textarea is empty', async () => {
    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      const applyBtn = screen.getByText('Apply');
      expect(applyBtn.closest('button')?.disabled).toBe(true);
    });
  });

  it('applies valid JSON resource via K8s API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeDefined();
    });

    const textarea = screen.getByPlaceholderText(/apiVersion/);
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'test-cm', namespace: 'default' },
          data: { key: 'value' },
        }),
      },
    });

    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'ConfigMap created' }),
      );
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/kubernetes/api/v1/namespaces/default/configmaps',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error toast for invalid JSON', async () => {
    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeDefined();
    });

    const textarea = screen.getByPlaceholderText(/apiVersion/);
    fireEvent.change(textarea, { target: { value: 'not valid json {{{' } });
    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Apply failed' }),
      );
    });
  });

  it('shows error toast when API returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Forbidden'),
    });

    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeDefined();
    });

    const textarea = screen.getByPlaceholderText(/apiVersion/);
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'test', namespace: 'default' },
        }),
      },
    });

    fireEvent.click(screen.getByText('Apply'));

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Apply failed' }),
      );
    });
  });

  it('navigates to correct path for From Git option', () => {
    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[0]); // From Git
    expect(navigateMock).toHaveBeenCalledWith('/developer/git-import');
  });

  it('Cancel button closes the YAML dialog', async () => {
    renderAddPage();
    const buttons = screen.getAllByText('Select');
    fireEvent.click(buttons[4]);

    await waitFor(() => {
      expect(screen.getByText('Import YAML')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Import YAML')).toBeNull();
    });
  });
});
