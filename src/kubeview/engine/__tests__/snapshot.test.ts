// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { compareSnapshots, loadSnapshots, saveSnapshots, type ClusterSnapshot } from '../snapshot';

function makeSnapshot(overrides: Partial<ClusterSnapshot> = {}): ClusterSnapshot {
  return {
    id: 'snap-1',
    label: 'test',
    timestamp: new Date().toISOString(),
    clusterVersion: '4.17.0',
    platform: 'AWS',
    controlPlaneTopology: 'HighlyAvailable',
    nodes: { count: 6, versions: ['v1.30.0'] },
    clusterOperators: [],
    crds: [],
    storageClasses: [],
    namespaceCount: 10,
    ...overrides,
  };
}

describe('snapshot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadSnapshots', () => {
    it('returns empty array when nothing stored', () => {
      expect(loadSnapshots()).toEqual([]);
    });

    it('returns parsed snapshots', () => {
      const snaps = [makeSnapshot({ id: 'snap-1' })];
      localStorage.setItem('openshiftpulse-snapshots', JSON.stringify(snaps));
      expect(loadSnapshots()).toEqual(snaps);
    });

    it('returns empty array on invalid JSON', () => {
      localStorage.setItem('openshiftpulse-snapshots', 'bad{json');
      expect(loadSnapshots()).toEqual([]);
    });
  });

  describe('saveSnapshots', () => {
    it('persists snapshots to localStorage', () => {
      const snaps = [makeSnapshot({ id: 'snap-1' })];
      saveSnapshots(snaps);
      expect(loadSnapshots()).toEqual(snaps);
    });

    it('trims to max 10 snapshots keeping latest', () => {
      const snaps = Array.from({ length: 15 }, (_, i) => makeSnapshot({ id: `snap-${i}` }));
      saveSnapshots(snaps);
      const loaded = loadSnapshots();
      expect(loaded).toHaveLength(10);
      expect(loaded[0].id).toBe('snap-5');
    });
  });

  describe('compareSnapshots', () => {
    it('detects controlPlaneTopology change', () => {
      const left = makeSnapshot({ controlPlaneTopology: 'HighlyAvailable' });
      const right = makeSnapshot({ controlPlaneTopology: 'External' });
      const diff = compareSnapshots(left, right);
      const topologyRow = diff.find(r => r.field === 'Control Plane Topology');
      expect(topologyRow).toBeDefined();
      expect(topologyRow!.changed).toBe(true);
      expect(topologyRow!.left).toBe('HighlyAvailable');
      expect(topologyRow!.right).toBe('External');
    });

    it('shows no change when controlPlaneTopology is the same', () => {
      const left = makeSnapshot({ controlPlaneTopology: 'External' });
      const right = makeSnapshot({ controlPlaneTopology: 'External' });
      const diff = compareSnapshots(left, right);
      const topologyRow = diff.find(r => r.field === 'Control Plane Topology');
      expect(topologyRow).toBeDefined();
      expect(topologyRow!.changed).toBe(false);
    });

    it('handles missing controlPlaneTopology gracefully', () => {
      const left = makeSnapshot({ controlPlaneTopology: '' });
      const right = makeSnapshot({ controlPlaneTopology: 'External' });
      const diff = compareSnapshots(left, right);
      const topologyRow = diff.find(r => r.field === 'Control Plane Topology');
      expect(topologyRow).toBeDefined();
      expect(topologyRow!.changed).toBe(true);
      expect(topologyRow!.left).toBe('—');
      expect(topologyRow!.right).toBe('External');
    });

    it('includes controlPlaneTopology in Cluster category', () => {
      const left = makeSnapshot();
      const right = makeSnapshot();
      const diff = compareSnapshots(left, right);
      const topologyRow = diff.find(r => r.field === 'Control Plane Topology');
      expect(topologyRow!.category).toBe('Cluster');
    });

    it('detects cluster version change', () => {
      const left = makeSnapshot({ clusterVersion: '4.16.0' });
      const right = makeSnapshot({ clusterVersion: '4.17.0' });
      const diff = compareSnapshots(left, right);
      const row = diff.find(r => r.field === 'Cluster Version');
      expect(row!.changed).toBe(true);
      expect(row!.left).toBe('4.16.0');
      expect(row!.right).toBe('4.17.0');
    });

    it('detects node count change', () => {
      const left = makeSnapshot({ nodes: { count: 3, versions: ['v1.30.0'] } });
      const right = makeSnapshot({ nodes: { count: 6, versions: ['v1.30.0'] } });
      const diff = compareSnapshots(left, right);
      const row = diff.find(r => r.field === 'Node Count');
      expect(row!.changed).toBe(true);
      expect(row!.left).toBe('3');
      expect(row!.right).toBe('6');
    });

    it('detects added CRDs', () => {
      const left = makeSnapshot({ crds: ['a.example.com'] });
      const right = makeSnapshot({ crds: ['a.example.com', 'b.example.com'] });
      const diff = compareSnapshots(left, right);
      const added = diff.find(r => r.field === 'CRDs Added');
      expect(added).toBeDefined();
      expect(added!.right).toBe('b.example.com');
      expect(added!.changed).toBe(true);
    });

    it('detects removed CRDs', () => {
      const left = makeSnapshot({ crds: ['a.example.com', 'b.example.com'] });
      const right = makeSnapshot({ crds: ['a.example.com'] });
      const diff = compareSnapshots(left, right);
      const removed = diff.find(r => r.field === 'CRDs Removed');
      expect(removed).toBeDefined();
      expect(removed!.left).toBe('b.example.com');
    });

    it('detects operator version changes', () => {
      const left = makeSnapshot({
        clusterOperators: [{ name: 'etcd', version: '4.16.0', available: true, degraded: false }],
      });
      const right = makeSnapshot({
        clusterOperators: [{ name: 'etcd', version: '4.17.0', available: true, degraded: false }],
      });
      const diff = compareSnapshots(left, right);
      const row = diff.find(r => r.field === 'Operator: etcd');
      expect(row).toBeDefined();
      expect(row!.changed).toBe(true);
      expect(row!.left).toBe('v4.16.0');
      expect(row!.right).toBe('v4.17.0');
    });

    it('detects new operators', () => {
      const left = makeSnapshot({ clusterOperators: [] });
      const right = makeSnapshot({
        clusterOperators: [{ name: 'kube-apiserver', version: '4.17.0', available: true, degraded: false }],
      });
      const diff = compareSnapshots(left, right);
      const row = diff.find(r => r.field === 'Operator: kube-apiserver');
      expect(row).toBeDefined();
      expect(row!.left).toBe('(not present)');
    });

    it('compares RBAC fields when both present', () => {
      const left = makeSnapshot({
        rbac: { clusterAdminSubjects: ['User/admin'], clusterRoleBindingCount: 50, roleBindingCount: 100 },
      });
      const right = makeSnapshot({
        rbac: { clusterAdminSubjects: ['User/admin', 'Group/ops'], clusterRoleBindingCount: 55, roleBindingCount: 100 },
      });
      const diff = compareSnapshots(left, right);
      const crbRow = diff.find(r => r.field === 'ClusterRoleBindings');
      expect(crbRow!.changed).toBe(true);
      const addedAdmin = diff.find(r => r.field === 'Cluster-Admin Added');
      expect(addedAdmin).toBeDefined();
      expect(addedAdmin!.right).toBe('Group/ops');
    });

    it('compares config fields when both present', () => {
      const left = makeSnapshot({
        config: {
          identityProviders: ['LDAP (ldap)'],
          tlsProfile: 'Intermediate',
          proxyEnabled: false,
          encryptionType: 'identity',
          schedulerProfile: 'HighNodeUtilization',
          ingressDomain: 'apps.cluster.example.com',
        },
      });
      const right = makeSnapshot({
        config: {
          identityProviders: ['LDAP (ldap)', 'GitHub (github)'],
          tlsProfile: 'Modern',
          proxyEnabled: true,
          encryptionType: 'aescbc',
          schedulerProfile: 'HighNodeUtilization',
          ingressDomain: 'apps.cluster.example.com',
        },
      });
      const diff = compareSnapshots(left, right);
      expect(diff.find(r => r.field === 'Identity Providers')!.changed).toBe(true);
      expect(diff.find(r => r.field === 'TLS Profile')!.changed).toBe(true);
      expect(diff.find(r => r.field === 'Proxy')!.changed).toBe(true);
      expect(diff.find(r => r.field === 'Encryption')!.changed).toBe(true);
      expect(diff.find(r => r.field === 'Scheduler Profile')!.changed).toBe(false);
      expect(diff.find(r => r.field === 'Ingress Domain')!.changed).toBe(false);
    });

    it('reports no changes for identical snapshots', () => {
      const snap = makeSnapshot();
      const diff = compareSnapshots(snap, snap);
      expect(diff.every(r => !r.changed)).toBe(true);
    });
  });
});
