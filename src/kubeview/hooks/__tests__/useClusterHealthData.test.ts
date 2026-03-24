// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Track which API paths are requested
const _mockListWatchData: Record<string, any[]> = {};

vi.mock('../useK8sListWatch', () => ({
  useK8sListWatch: ({ apiPath }: { apiPath: string }) => ({
    data: _mockListWatchData[apiPath] || [],
    isLoading: false,
  }),
}));

import { useClusterHealthData } from '../useClusterHealthData';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useClusterHealthData', () => {
  afterEach(() => {
    cleanup();
    Object.keys(_mockListWatchData).forEach((k) => delete _mockListWatchData[k]);
  });

  it('returns all expected fields', () => {
    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty('nodes');
    expect(result.current).toHaveProperty('pods');
    expect(result.current).toHaveProperty('deployments');
    expect(result.current).toHaveProperty('events');
    expect(result.current).toHaveProperty('pvcs');
    expect(result.current).toHaveProperty('isLoading');
  });

  it('returns empty arrays when no data', () => {
    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.nodes).toEqual([]);
    expect(result.current.pods).toEqual([]);
    expect(result.current.deployments).toEqual([]);
    expect(result.current.events).toEqual([]);
    expect(result.current.pvcs).toEqual([]);
  });

  it('returns isLoading as false when all queries are loaded', () => {
    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('returns node data from list watch', () => {
    _mockListWatchData['/api/v1/nodes'] = [
      { metadata: { name: 'worker-1', uid: 'n1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
      { metadata: { name: 'worker-2', uid: 'n2' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
    ];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0].metadata.name).toBe('worker-1');
  });

  it('returns pod data from list watch', () => {
    _mockListWatchData['/api/v1/pods'] = [
      { metadata: { name: 'nginx-1', uid: 'p1' }, status: { phase: 'Running' } },
    ];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.pods).toHaveLength(1);
    expect(result.current.pods[0].metadata.name).toBe('nginx-1');
  });

  it('returns deployment data from list watch', () => {
    _mockListWatchData['/apis/apps/v1/deployments'] = [
      { metadata: { name: 'api-server', uid: 'd1' }, spec: { replicas: 3 }, status: { readyReplicas: 3 } },
    ];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.deployments).toHaveLength(1);
    expect(result.current.deployments[0].metadata.name).toBe('api-server');
  });

  it('returns event data from list watch', () => {
    _mockListWatchData['/api/v1/events'] = [
      { metadata: { name: 'evt-1', uid: 'e1' }, type: 'Warning', reason: 'BackOff' },
    ];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.events).toHaveLength(1);
  });

  it('returns PVC data from list watch', () => {
    _mockListWatchData['/api/v1/persistentvolumeclaims'] = [
      { metadata: { name: 'data-vol', uid: 'pvc1' }, status: { phase: 'Bound' } },
    ];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.pvcs).toHaveLength(1);
    expect(result.current.pvcs[0].metadata.name).toBe('data-vol');
  });

  it('queries the correct API paths', () => {
    // Verify the hook uses the correct standard K8s API paths
    // by checking it reads from the exact paths we set data on
    _mockListWatchData['/api/v1/nodes'] = [{ metadata: { name: 'n', uid: '1' } }];
    _mockListWatchData['/api/v1/pods'] = [{ metadata: { name: 'p', uid: '2' } }];
    _mockListWatchData['/apis/apps/v1/deployments'] = [{ metadata: { name: 'd', uid: '3' } }];
    _mockListWatchData['/api/v1/events'] = [{ metadata: { name: 'e', uid: '4' } }];
    _mockListWatchData['/api/v1/persistentvolumeclaims'] = [{ metadata: { name: 'pvc', uid: '5' } }];

    const { result } = renderHook(() => useClusterHealthData(), {
      wrapper: createWrapper(),
    });

    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.pods).toHaveLength(1);
    expect(result.current.deployments).toHaveLength(1);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.pvcs).toHaveLength(1);
  });
});
