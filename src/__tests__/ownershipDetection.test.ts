// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectOwnership, getManagerShort } from '../lib/ownershipDetection';

describe('ownershipDetection', () => {
  it('detects Helm from labels', () => {
    const resource = {
      metadata: {
        labels: { 'app.kubernetes.io/managed-by': 'Helm' },
        annotations: { 'meta.helm.sh/release-name': 'my-release', 'meta.helm.sh/release-namespace': 'default' },
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Helm');
    expect(result.detail).toContain('my-release');
    expect(result.willOverwrite).toBe(true);
    expect(result.color).toBe('blue');
  });

  it('detects ArgoCD from labels', () => {
    const resource = {
      metadata: {
        labels: { 'app.kubernetes.io/managed-by': 'argocd' },
        annotations: { 'argocd.argoproj.io/managed-by': 'production' },
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('ArgoCD');
    expect(result.detail).toContain('production');
    expect(result.willOverwrite).toBe(true);
    expect(result.color).toBe('purple');
  });

  it('detects ArgoCD from annotations when no managed-by label', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: { 'argocd.argoproj.io/tracking-id': 'staging-app' },
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('ArgoCD');
    expect(result.detail).toContain('staging-app');
  });

  it('detects Helm from annotations when no managed-by label', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: { 'meta.helm.sh/release-name': 'nginx-release' },
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Helm');
    expect(result.detail).toContain('nginx-release');
  });

  it('detects Operator from ownerReferences', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: {},
        ownerReferences: [
          { kind: 'ClusterServiceVersion', name: 'elasticsearch-operator.v5.6.0' },
        ],
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Operator');
    expect(result.detail).toContain('elasticsearch-operator');
    expect(result.willOverwrite).toBe(true);
  });

  it('detects standard K8s ownership (RS→Deployment)', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: {},
        ownerReferences: [
          { kind: 'ReplicaSet', name: 'my-app-abc123' },
        ],
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Owned by ReplicaSet');
    expect(result.detail).toBe('my-app-abc123');
    expect(result.willOverwrite).toBe(false);
  });

  it('detects kubectl from managedFields', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{}' },
        managedFields: [
          { manager: 'kubectl-client-side-apply', operation: 'Apply', time: '2024-01-01T00:00:00Z' },
        ],
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('kubectl apply');
    expect(result.color).toBe('orange');
  });

  it('detects Console (browser) from managedFields', () => {
    const resource = {
      metadata: {
        labels: {},
        annotations: {},
        managedFields: [
          { manager: 'Mozilla', operation: 'Update', time: '2024-01-01T00:00:00Z' },
        ],
      },
    };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Console (browser)');
    expect(result.color).toBe('green');
  });

  it('returns Unknown for bare resources', () => {
    const resource = { metadata: { labels: {}, annotations: {} } };
    const result = detectOwnership(resource);
    expect(result.manager).toBe('Unknown');
    expect(result.willOverwrite).toBe(false);
  });

  it('handles missing metadata gracefully', () => {
    const result = detectOwnership({});
    expect(result.manager).toBe('Unknown');
  });

  it('getManagerShort returns compact string', () => {
    const resource = {
      metadata: {
        labels: { 'app.kubernetes.io/managed-by': 'Helm' },
        annotations: { 'meta.helm.sh/release-name': 'my-app' },
      },
    };
    const short = getManagerShort(resource);
    expect(short).toContain('Helm');
    expect(short).toContain('my-app');
  });
});
