import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ageFromTimestamp, checkClusterConnection } from '../lib/k8s';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ageFromTimestamp', () => {
  it('returns day-based age for timestamps days ago', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(ageFromTimestamp(fiveDaysAgo)).toBe('5d');
  });

  it('returns hour-based age for timestamps hours ago', () => {
    const sevenHoursAgo = new Date(Date.now() - 7 * 3600000).toISOString();
    expect(ageFromTimestamp(sevenHoursAgo)).toBe('7h');
  });

  it('returns minute-based age for timestamps minutes ago', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
    expect(ageFromTimestamp(tenMinAgo)).toBe('10m');
  });

  it('returns "-" for undefined input', () => {
    expect(ageFromTimestamp(undefined)).toBe('-');
  });

  it('returns "-" for empty string input', () => {
    expect(ageFromTimestamp('')).toBe('-');
  });

  it('returns "0m" for a just-now timestamp', () => {
    const now = new Date().toISOString();
    expect(ageFromTimestamp(now)).toBe('0m');
  });
});

describe('checkClusterConnection', () => {
  it('returns true when cluster is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true }),
      ),
    );

    const result = await checkClusterConnection();
    expect(result).toBe(true);
  });

  it('returns false when cluster returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false }),
      ),
    );

    const result = await checkClusterConnection();
    expect(result).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network error'))),
    );

    const result = await checkClusterConnection();
    expect(result).toBe(false);
  });
});
