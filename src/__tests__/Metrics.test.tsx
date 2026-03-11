// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Metrics from '../pages/observe/Metrics';

const addToastMock = vi.fn();

vi.mock('@/store/useUIStore', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: addToastMock }),
}));

function renderMetrics() {
  return render(
    <MemoryRouter>
      <Metrics />
    </MemoryRouter>,
  );
}

describe('Metrics page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    addToastMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the title and query input', () => {
    renderMetrics();
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(screen.getByPlaceholderText('Enter PromQL query...')).toBeDefined();
  });

  it('renders all 6 example query buttons', () => {
    renderMetrics();
    const buttons = screen.getAllByRole('button');
    const quickButtons = buttons.filter((b) => b.classList.contains('os-metrics__quick-action-btn'));
    expect(quickButtons).toHaveLength(6);
  });

  it('does not show results section initially', () => {
    renderMetrics();
    expect(screen.queryByText(/Results for:/)).toBeNull();
  });

  it('runs query on Enter key press and shows results', async () => {
    const mockResponse = {
      data: {
        resultType: 'vector',
        result: [
          { metric: { __name__: 'up' }, value: [1234567890, '1'] },
        ],
      },
    };
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { result: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResponse) });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'up' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Results for:/)).toBeDefined();
      expect(screen.getByText('1 series returned (vector)')).toBeDefined();
    });
  });

  it('displays range query results with charts', async () => {
    const mockResponse = {
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { namespace: 'default' },
            values: [
              [1000, '10'], [1030, '20'], [1060, '15'], [1090, '25'],
            ],
          },
        ],
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'test_metric' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('1 series returned (matrix)')).toBeDefined();
      expect(screen.getByText(/Latest:/)).toBeDefined();
    });
  });

  it('falls back to instant query when range returns empty', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { resultType: 'matrix', result: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            resultType: 'vector',
            result: [
              { metric: { instance: '10.0.0.1' }, value: [1234567890, '42.5'] },
              { metric: { instance: '10.0.0.2' }, value: [1234567890, '1500000'] },
            ],
          },
        }),
      });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'node_load1' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('2 series returned (vector)')).toBeDefined();
      expect(screen.getByText('42.50')).toBeDefined();
      expect(screen.getByText('1.50 M')).toBeDefined();
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shows error toast on query failure', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'up' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', title: 'Query failed' }),
      );
    });
  });

  it('handles NaN values in chart data without crashing', async () => {
    const mockResponse = {
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { job: 'test' },
            values: [
              [1000, 'NaN'], [1030, '10'], [1060, 'NaN'], [1090, '20'],
            ],
          },
        ],
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('1 series returned (matrix)')).toBeDefined();
    });
  });

  it('does not run empty queries', () => {
    global.fetch = vi.fn();
    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('limits displayed series to 12 and shows overflow message', async () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      metric: { instance: `10.0.0.${i}` },
      value: [1234567890, String(i * 10)] as [number, string],
    }));
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { resultType: 'matrix', result: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { resultType: 'vector', result: results } }),
      });

    renderMetrics();
    const input = screen.getByPlaceholderText('Enter PromQL query...');
    fireEvent.change(input, { target: { value: 'up' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('15 series returned (vector)')).toBeDefined();
      expect(screen.getByText(/Showing 12 of 15 series/)).toBeDefined();
    });
  });
});
