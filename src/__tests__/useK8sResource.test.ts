// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useK8sResource, ageFromTimestamp } from '../hooks/useK8sResource';

interface RawItem {
  metadata: { name: string; namespace?: string };
}

interface TransformedItem {
  name: string;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useK8sResource', () => {
  it('returns loading=true initially', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})), // never resolves
    );

    const { result } = renderHook(() =>
      useK8sResource<RawItem, TransformedItem>(
        '/api/v1/pods',
        (item) => ({ name: item.metadata.name }),
      ),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('transforms data correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                { metadata: { name: 'pod-1', namespace: 'ns-a' } },
                { metadata: { name: 'pod-2', namespace: 'ns-b' } },
              ],
            }),
        }),
      ),
    );

    const { result } = renderHook(() =>
      useK8sResource<RawItem, TransformedItem>(
        '/api/v1/pods',
        (item) => ({ name: item.metadata.name }),
      ),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      { name: 'pod-1' },
      { name: 'pod-2' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        }),
      ),
    );

    const { result } = renderHook(() =>
      useK8sResource<RawItem, TransformedItem>(
        '/api/v1/pods',
        (item) => ({ name: item.metadata.name }),
      ),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('403 Forbidden');
    expect(result.current.data).toEqual([]);
  });
});

describe('ageFromTimestamp', () => {
  it('returns days for timestamps older than 24h', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    expect(ageFromTimestamp(twoDaysAgo)).toBe('2d');
  });

  it('returns hours for timestamps older than 60m but less than 24h', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    expect(ageFromTimestamp(threeHoursAgo)).toBe('3h');
  });

  it('returns minutes for recent timestamps', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(ageFromTimestamp(fiveMinAgo)).toBe('5m');
  });

  it('returns "-" for undefined input', () => {
    expect(ageFromTimestamp(undefined)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(ageFromTimestamp('')).toBe('-');
  });
});
