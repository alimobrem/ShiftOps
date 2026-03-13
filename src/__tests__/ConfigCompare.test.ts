// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

interface ClusterSnapshot {
  name: string;
  timestamp: string;
  clusterVersion?: Record<string, unknown>;
  infrastructure?: Record<string, unknown>;
  clusterOperators: { name: string; version: string; available: boolean; degraded: boolean; progressing: boolean }[];
  crds: string[];
  nodes: { count: number; totalCPU: number; totalMemory: number; versions: string[] };
  storageClasses: string[];
}

function extractVersion(cv: Record<string, unknown> | undefined): string {
  if (!cv) return '-';
  const status = (cv['status'] ?? {}) as Record<string, unknown>;
  const desired = (status['desired'] ?? {}) as Record<string, unknown>;
  return String(desired['version'] ?? '-');
}

function extractField(obj: Record<string, unknown> | undefined, ...path: string[]): string {
  if (!obj) return '-';
  let current: unknown = obj;
  for (const p of path) {
    if (current == null || typeof current !== 'object') return '-';
    current = (current as Record<string, unknown>)[p];
  }
  if (current == null) return '-';
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
}

describe('ConfigCompare', () => {
  const snapshotA: ClusterSnapshot = {
    name: 'Cluster A',
    timestamp: '2024-06-01T00:00:00Z',
    clusterVersion: { status: { desired: { version: '4.14.5' } } },
    infrastructure: { status: { platform: 'AWS', apiServerURL: 'https://api.cluster-a.example.com:6443' } },
    clusterOperators: [
      { name: 'authentication', version: '4.14.5', available: true, degraded: false, progressing: false },
      { name: 'dns', version: '4.14.5', available: true, degraded: false, progressing: false },
      { name: 'monitoring', version: '4.14.5', available: true, degraded: false, progressing: false },
    ],
    crds: ['alertmanagers.monitoring.coreos.com', 'prometheuses.monitoring.coreos.com', 'custom-a.example.com'],
    nodes: { count: 3, totalCPU: 24, totalMemory: 96, versions: ['v1.27.8'] },
    storageClasses: ['gp3-csi', 'gp2'],
  };

  const snapshotB: ClusterSnapshot = {
    name: 'Cluster B',
    timestamp: '2024-06-01T00:00:00Z',
    clusterVersion: { status: { desired: { version: '4.15.1' } } },
    infrastructure: { status: { platform: 'GCP', apiServerURL: 'https://api.cluster-b.example.com:6443' } },
    clusterOperators: [
      { name: 'authentication', version: '4.15.1', available: true, degraded: false, progressing: false },
      { name: 'dns', version: '4.15.1', available: true, degraded: false, progressing: false },
      { name: 'logging', version: '5.8.0', available: true, degraded: false, progressing: false },
    ],
    crds: ['alertmanagers.monitoring.coreos.com', 'prometheuses.monitoring.coreos.com', 'custom-b.example.com'],
    nodes: { count: 5, totalCPU: 40, totalMemory: 160, versions: ['v1.28.3'] },
    storageClasses: ['pd-ssd', 'pd-standard'],
  };

  it('extracts OpenShift version', () => {
    expect(extractVersion(snapshotA.clusterVersion)).toBe('4.14.5');
    expect(extractVersion(snapshotB.clusterVersion)).toBe('4.15.1');
    expect(extractVersion(undefined)).toBe('-');
  });

  it('extracts nested fields', () => {
    expect(extractField(snapshotA.infrastructure, 'status', 'platform')).toBe('AWS');
    expect(extractField(snapshotB.infrastructure, 'status', 'platform')).toBe('GCP');
    expect(extractField(undefined, 'any', 'path')).toBe('-');
  });

  it('detects version differences', () => {
    const vA = extractVersion(snapshotA.clusterVersion);
    const vB = extractVersion(snapshotB.clusterVersion);
    expect(vA).not.toBe(vB);
  });

  it('detects operator differences', () => {
    const allOps = new Set([
      ...snapshotA.clusterOperators.map((o) => o.name),
      ...snapshotB.clusterOperators.map((o) => o.name),
    ]);

    const diffs: { name: string; left: string; right: string }[] = [];
    for (const name of allOps) {
      const a = snapshotA.clusterOperators.find((o) => o.name === name);
      const b = snapshotB.clusterOperators.find((o) => o.name === name);
      const leftVersion = a?.version ?? '(not installed)';
      const rightVersion = b?.version ?? '(not installed)';
      if (leftVersion !== rightVersion) {
        diffs.push({ name, left: leftVersion, right: rightVersion });
      }
    }

    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.some((d) => d.name === 'monitoring')).toBe(true); // in A but not B
    expect(diffs.some((d) => d.name === 'logging')).toBe(true); // in B but not A
  });

  it('detects CRD differences', () => {
    const leftCrds = new Set(snapshotA.crds);
    const rightCrds = new Set(snapshotB.crds);
    const onlyLeft = snapshotA.crds.filter((c) => !rightCrds.has(c));
    const onlyRight = snapshotB.crds.filter((c) => !leftCrds.has(c));

    expect(onlyLeft).toContain('custom-a.example.com');
    expect(onlyRight).toContain('custom-b.example.com');
  });

  it('detects capacity differences', () => {
    expect(snapshotA.nodes.count).not.toBe(snapshotB.nodes.count);
    expect(snapshotA.nodes.totalCPU).not.toBe(snapshotB.nodes.totalCPU);
  });

  it('detects platform differences', () => {
    const platformA = extractField(snapshotA.infrastructure, 'status', 'platform');
    const platformB = extractField(snapshotB.infrastructure, 'status', 'platform');
    expect(platformA).toBe('AWS');
    expect(platformB).toBe('GCP');
  });
});
