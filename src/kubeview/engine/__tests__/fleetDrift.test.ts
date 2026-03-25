// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../store/uiStore', () => ({
  useUIStore: {
    getState: () => ({ impersonateUser: null, impersonateGroups: [] }),
  },
}));

vi.mock('../query', () => ({
  k8sGet: vi.fn(),
}));

vi.mock('../clusterConnection', () => ({
  getAllConnections: vi.fn(() => [
    { id: 'c1', name: 'cluster-1', status: 'connected' },
    { id: 'c2', name: 'cluster-2', status: 'connected' },
  ]),
}));

import { fleetCompareResource, flattenObject } from '../fleetDrift';
import { k8sGet } from '../query';
import { getAllConnections } from '../clusterConnection';

const mockK8sGet = vi.mocked(k8sGet);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('flattenObject', () => {
  it('flattens nested objects to dot-notation paths', () => {
    const result = flattenObject({
      metadata: { name: 'test', labels: { app: 'web' } },
      spec: { replicas: 3 },
    });
    expect(result).toEqual({
      'metadata.name': 'test',
      'metadata.labels.app': 'web',
      'spec.replicas': 3,
    });
  });
});

describe('fleetCompareResource', () => {
  const baseResource = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'my-app',
      namespace: 'default',
      uid: 'uid-1',
      resourceVersion: '100',
      creationTimestamp: '2025-01-01T00:00:00Z',
      generation: 1,
    },
    spec: { replicas: 3, strategy: { type: 'RollingUpdate' } },
    status: { readyReplicas: 3 },
  };

  it('compares identical resources — all fields marked not drifted', async () => {
    mockK8sGet.mockResolvedValue({ ...baseResource });

    const result = await fleetCompareResource('/apis/apps/v1/deployments', 'my-app', 'default');

    expect(result.driftedFields).toBe(0);
    expect(result.clusters).toEqual(['c1', 'c2']);
    expect(result.diffs.every(d => !d.drifted)).toBe(true);
  });

  it('detects drifted fields — spec.replicas differs', async () => {
    mockK8sGet
      .mockResolvedValueOnce({ ...baseResource, spec: { ...baseResource.spec, replicas: 3 } })
      .mockResolvedValueOnce({ ...baseResource, spec: { ...baseResource.spec, replicas: 5 } });

    const result = await fleetCompareResource('/apis/apps/v1/deployments', 'my-app', 'default');

    expect(result.driftedFields).toBeGreaterThan(0);
    const replicaDiff = result.diffs.find(d => d.field === 'spec.replicas');
    expect(replicaDiff).toBeTruthy();
    expect(replicaDiff!.drifted).toBe(true);
    expect(replicaDiff!.values['c1']).toBe(3);
    expect(replicaDiff!.values['c2']).toBe(5);
  });

  it('ignores metadata.uid and status fields', async () => {
    mockK8sGet.mockResolvedValue({ ...baseResource });

    const result = await fleetCompareResource('/apis/apps/v1/deployments', 'my-app', 'default');

    const fields = result.diffs.map(d => d.field);
    expect(fields).not.toContain('metadata.uid');
    expect(fields).not.toContain('metadata.resourceVersion');
    expect(fields).not.toContain('status.readyReplicas');
  });

  it('handles cluster errors gracefully (one cluster unreachable)', async () => {
    mockK8sGet
      .mockResolvedValueOnce({ ...baseResource })
      .mockRejectedValueOnce(new Error('Connection refused'));

    const result = await fleetCompareResource('/apis/apps/v1/deployments', 'my-app', 'default');

    expect(result.clusters).toEqual(['c1']);
    expect(result.driftedFields).toBe(0);
  });
});
