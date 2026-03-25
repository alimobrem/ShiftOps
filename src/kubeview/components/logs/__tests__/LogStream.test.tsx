// @vitest-environment jsdom
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

vi.stubGlobal('fetch', vi.fn());

import LogStream from '../LogStream';

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => cleanup());

beforeEach(() => {
  vi.mocked(fetch).mockReset();
});

function mockFetchResponse(status: number, body: string | object) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === 'object' ? body : JSON.parse(text)),
    body: null,
  } as any);
}

describe('LogStream', () => {
  it('fetches logs successfully on mount', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockFetchResponse(200, 'line one\nline two'));

    await act(async () => {
      render(<LogStream namespace="default" podName="web-1" />);
    });

    expect(screen.getByText('line one')).toBeTruthy();
    expect(screen.getByText('line two')).toBeTruthy();
  });

  it('retries with container name on 400 response (multi-container pod)', async () => {
    // First call: log fetch returns 400
    vi.mocked(fetch).mockReturnValueOnce(mockFetchResponse(400, 'must specify container'));
    // Second call: pod fetch to discover containers
    vi.mocked(fetch).mockReturnValueOnce(
      mockFetchResponse(200, { spec: { containers: [{ name: 'web' }] } })
    );
    // Third call: retry log fetch with container=web
    vi.mocked(fetch).mockReturnValueOnce(mockFetchResponse(200, 'log line 1\nlog line 2'));

    await act(async () => {
      render(<LogStream namespace="default" podName="multi-pod" />);
    });

    // Verify the retry fetch included the container param
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBe(3);
    expect(calls[2][0]).toContain('container=web');

    expect(screen.getByText('log line 1')).toBeTruthy();
    expect(screen.getByText('log line 2')).toBeTruthy();
  });

  it('shows error on non-400 failure', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockFetchResponse(500, 'Internal Server Error'));

    await act(async () => {
      render(<LogStream namespace="default" podName="crash-pod" />);
    });

    expect(screen.getByText(/Failed to fetch logs: 500/)).toBeTruthy();
  });
});
