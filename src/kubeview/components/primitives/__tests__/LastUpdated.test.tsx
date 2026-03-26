/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LastUpdated, formatTimeAgo, earliestDataUpdatedAt } from '../LastUpdated';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps within 5 seconds', () => {
    expect(formatTimeAgo(Date.now() - 2000)).toBe('just now');
  });

  it('returns seconds ago for timestamps within a minute', () => {
    expect(formatTimeAgo(Date.now() - 30_000)).toBe('30s ago');
  });

  it('returns minutes ago for timestamps within an hour', () => {
    expect(formatTimeAgo(Date.now() - 120_000)).toBe('2m ago');
  });

  it('returns hours ago for timestamps over an hour', () => {
    expect(formatTimeAgo(Date.now() - 7_200_000)).toBe('2h ago');
  });
});

describe('earliestDataUpdatedAt', () => {
  it('returns 0 when all queries have dataUpdatedAt of 0', () => {
    expect(earliestDataUpdatedAt([{ dataUpdatedAt: 0 }, { dataUpdatedAt: 0 }])).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(earliestDataUpdatedAt([])).toBe(0);
  });

  it('returns the earliest non-zero timestamp', () => {
    expect(earliestDataUpdatedAt([
      { dataUpdatedAt: 1000 },
      { dataUpdatedAt: 500 },
      { dataUpdatedAt: 2000 },
    ])).toBe(500);
  });

  it('ignores zero timestamps', () => {
    expect(earliestDataUpdatedAt([
      { dataUpdatedAt: 0 },
      { dataUpdatedAt: 1500 },
      { dataUpdatedAt: 0 },
    ])).toBe(1500);
  });
});

describe('LastUpdated', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing when timestamp is 0', () => {
    const { container } = render(<LastUpdated timestamp={0} />, {
      wrapper: createWrapper(),
    });
    expect(container.innerHTML).toBe('');
  });

  it('renders the time-ago text', () => {
    render(<LastUpdated timestamp={Date.now() - 15_000} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByTestId('last-updated-text').textContent).toBe('Updated 15s ago');
  });

  it('renders a refresh button', () => {
    render(<LastUpdated timestamp={Date.now() - 5000} />, {
      wrapper: createWrapper(),
    });
    const btn = screen.getByTestId('refresh-button');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('title')).toBe('Refresh data');
  });

  it('invalidates k8s queries when refresh is clicked', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <LastUpdated timestamp={Date.now() - 10_000} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('refresh-button'));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['k8s'] });
  });

  it('auto-refreshes the display every 10 seconds', () => {
    const initialTime = Date.now();
    render(<LastUpdated timestamp={initialTime - 10_000} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByTestId('last-updated-text').textContent).toBe('Updated 10s ago');

    // advanceTimersByTime also advances Date.now() with fake timers
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('last-updated-text').textContent).toBe('Updated 20s ago');
  });
});
