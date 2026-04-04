import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryRange,
  queryInstant,
  getMetricNames,
  getLabelValues,
  seriesToDataPoints,
  parseDuration,
  formatDuration,
  getTimeRange,
} from '../prometheus';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockHttpError(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Server Error',
  });
}

describe('queryRange', () => {
  it('fetches range data and returns result', async () => {
    mockOk({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { pod: 'nginx' }, values: [[1000, '0.5'], [1015, '0.8']] },
        ],
      },
    });

    const result = await queryRange('up', 1000, 2000);
    expect(result).toHaveLength(1);
    expect(result[0].metric.pod).toBe('nginx');
    expect(result[0].values).toHaveLength(2);
  });

  it('builds correct URL with params', async () => {
    mockOk({ status: 'success', data: { result: [] } });

    await queryRange('cpu_usage', 1000, 2000, 30);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/prometheus/api/v1/query_range');
    expect(url).toContain('query=cpu_usage');
    expect(url).toContain('start=1000');
    expect(url).toContain('end=2000');
    expect(url).toContain('step=30');
  });

  it('calculates step automatically if not provided', async () => {
    mockOk({ status: 'success', data: { result: [] } });

    await queryRange('up', 0, 10000);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('step=50'); // floor(10000/200)
  });

  it('throws on HTTP error', async () => {
    mockHttpError(500);
    await expect(queryRange('up', 0, 100)).rejects.toThrow('Prometheus query failed');
  });

  it('throws on Prometheus error response', async () => {
    mockOk({ status: 'error', error: 'bad query', errorType: 'bad_data' });
    await expect(queryRange('invalid{', 0, 100)).rejects.toThrow('Prometheus error');
  });

  it('returns empty array when no data', async () => {
    mockOk({ status: 'success' });
    const result = await queryRange('up', 0, 100);
    expect(result).toEqual([]);
  });
});

describe('queryInstant', () => {
  it('fetches instant data and parses values', async () => {
    mockOk({
      status: 'success',
      data: {
        resultType: 'vector',
        result: [
          { metric: { instance: 'a' }, value: [1000, '42.5'] },
        ],
      },
    });

    const result = await queryInstant('up');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(42.5);
    expect(result[0].metric.instance).toBe('a');
  });

  it('adds time parameter when provided', async () => {
    mockOk({ status: 'success', data: { result: [] } });

    await queryInstant('up', 1234567890);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('time=1234567890');
  });

  it('omits time parameter when not provided', async () => {
    mockOk({ status: 'success', data: { result: [] } });

    await queryInstant('up');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain('time=');
  });

  it('throws on error', async () => {
    mockHttpError(500);
    await expect(queryInstant('up')).rejects.toThrow();
  });
});

describe('getMetricNames', () => {
  it('fetches metric names', async () => {
    mockOk({ status: 'success', data: ['up', 'node_cpu_seconds_total'] });

    const names = await getMetricNames();
    expect(names).toEqual(['up', 'node_cpu_seconds_total']);
  });

  it('calls correct endpoint', async () => {
    mockOk({ status: 'success', data: [] });

    await getMetricNames();
    expect(mockFetch).toHaveBeenCalledWith('/api/prometheus/api/v1/label/__name__/values', expect.objectContaining({ headers: expect.any(Object) }));
  });
});

describe('getLabelValues', () => {
  it('fetches label values', async () => {
    mockOk({ status: 'success', data: ['default', 'kube-system'] });

    const values = await getLabelValues('namespace');
    expect(values).toEqual(['default', 'kube-system']);
  });

  it('calls correct endpoint', async () => {
    mockOk({ status: 'success', data: [] });

    await getLabelValues('pod');
    expect(mockFetch).toHaveBeenCalledWith('/api/prometheus/api/v1/label/pod/values', expect.objectContaining({ headers: expect.any(Object) }));
  });
});

describe('seriesToDataPoints', () => {
  it('converts series to data points', () => {
    const series = {
      metric: { pod: 'nginx' },
      values: [[1000, '0.5'], [1015, '0.8'], [1030, '1.2']] as [number, string][],
    };

    const points = seriesToDataPoints(series);
    expect(points).toEqual([
      { timestamp: 1000, value: 0.5 },
      { timestamp: 1015, value: 0.8 },
      { timestamp: 1030, value: 1.2 },
    ]);
  });

  it('handles empty values', () => {
    const series = { metric: {}, values: [] as [number, string][] };
    expect(seriesToDataPoints(series)).toEqual([]);
  });
});

describe('parseDuration', () => {
  it('parses seconds', () => expect(parseDuration('30s')).toBe(30));
  it('parses minutes', () => expect(parseDuration('5m')).toBe(300));
  it('parses hours', () => expect(parseDuration('1h')).toBe(3600));
  it('parses days', () => expect(parseDuration('7d')).toBe(604800));
  it('parses weeks', () => expect(parseDuration('2w')).toBe(1209600));

  it('throws on invalid format', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration');
    expect(() => parseDuration('')).toThrow('Invalid duration');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => expect(formatDuration(30)).toBe('30s'));
  it('formats minutes', () => expect(formatDuration(300)).toBe('5m'));
  it('formats hours', () => expect(formatDuration(7200)).toBe('2h'));
  it('formats days', () => expect(formatDuration(172800)).toBe('2d'));
  it('formats weeks', () => expect(formatDuration(1209600)).toBe('2w'));
});

describe('getTimeRange', () => {
  it('returns start and end timestamps', () => {
    const [start, end] = getTimeRange('1h');
    expect(end - start).toBe(3600);
    expect(end).toBeCloseTo(Math.floor(Date.now() / 1000), -1);
  });

  it('works for different durations', () => {
    const [start5m, end5m] = getTimeRange('5m');
    expect(end5m - start5m).toBe(300);

    const [start1d, end1d] = getTimeRange('1d');
    expect(end1d - start1d).toBe(86400);
  });
});
