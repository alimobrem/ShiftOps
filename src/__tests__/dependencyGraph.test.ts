// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDependencyGraph, getNodeHref } from '../lib/dependencyGraph';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }));
}

describe('buildDependencyGraph', () => {
  it('builds graph with Pod→RS→Deployment chain', async () => {
    mockFetch({
      '/pods': {
        items: [
          {
            metadata: {
              name: 'my-app-abc-xyz',
              namespace: 'default',
              ownerReferences: [{ kind: 'ReplicaSet', name: 'my-app-abc' }],
              labels: { app: 'my-app' },
            },
            spec: { containers: [], volumes: [] },
            status: { phase: 'Running' },
          },
        ],
      },
      '/replicasets': {
        items: [
          {
            metadata: {
              name: 'my-app-abc',
              namespace: 'default',
              ownerReferences: [{ kind: 'Deployment', name: 'my-app' }],
            },
          },
        ],
      },
      '/deployments': { items: [{ metadata: { name: 'my-app', namespace: 'default' }, spec: { selector: { matchLabels: { app: 'my-app' } } } }] },
      '/services': { items: [] },
      '/ingresses': { items: [] },
      '/routes': { items: [] },
      '/horizontalpodautoscalers': { items: [] },
      '/configmaps': { items: [] },
      '/secrets': { items: [] },
      '/poddisruptionbudgets': { items: [] },
      '/networkpolicies': { items: [] },
    });

    const graph = await buildDependencyGraph('Deployment', 'my-app', 'default');

    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.nodes.some((n) => n.kind === 'Deployment' && n.name === 'my-app')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'ReplicaSet' && n.name === 'my-app-abc')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'Pod' && n.name === 'my-app-abc-xyz')).toBe(true);
    expect(graph.edges.some((e) => e.relationship === 'owns')).toBe(true);
  });

  it('links Service to Pods via selector', async () => {
    mockFetch({
      '/pods': {
        items: [
          {
            metadata: { name: 'web-pod', namespace: 'ns1', labels: { app: 'web' }, ownerReferences: [] },
            spec: { containers: [], volumes: [] },
            status: { phase: 'Running' },
          },
        ],
      },
      '/services': {
        items: [
          {
            metadata: { name: 'web-svc', namespace: 'ns1' },
            spec: { selector: { app: 'web' }, type: 'ClusterIP' },
          },
        ],
      },
      '/replicasets': { items: [] },
      '/deployments': { items: [] },
      '/ingresses': { items: [] },
      '/routes': { items: [] },
      '/horizontalpodautoscalers': { items: [] },
      '/configmaps': { items: [] },
      '/secrets': { items: [] },
      '/poddisruptionbudgets': { items: [] },
      '/networkpolicies': { items: [] },
    });

    const graph = await buildDependencyGraph('Service', 'web-svc', 'ns1');

    expect(graph.nodes.some((n) => n.kind === 'Service')).toBe(true);
    expect(graph.nodes.some((n) => n.kind === 'Pod')).toBe(true);
    expect(graph.edges.some((e) => e.relationship === 'selects')).toBe(true);
  });

  it('links Pod to ConfigMap via volume mount', async () => {
    mockFetch({
      '/pods': {
        items: [
          {
            metadata: { name: 'app-pod', namespace: 'ns1', labels: {}, ownerReferences: [] },
            spec: {
              containers: [{ name: 'app', envFrom: [] }],
              volumes: [{ configMap: { name: 'app-config' } }],
            },
            status: { phase: 'Running' },
          },
        ],
      },
      '/configmaps': { items: [{ metadata: { name: 'app-config', namespace: 'ns1' } }] },
      '/services': { items: [] },
      '/replicasets': { items: [] },
      '/deployments': { items: [] },
      '/ingresses': { items: [] },
      '/routes': { items: [] },
      '/horizontalpodautoscalers': { items: [] },
      '/secrets': { items: [] },
      '/poddisruptionbudgets': { items: [] },
      '/networkpolicies': { items: [] },
    });

    const graph = await buildDependencyGraph('Pod', 'app-pod', 'ns1');

    expect(graph.nodes.some((n) => n.kind === 'ConfigMap' && n.name === 'app-config')).toBe(true);
    expect(graph.edges.some((e) => e.relationship === 'mounts')).toBe(true);
  });

  it('returns empty graph for isolated resource', async () => {
    mockFetch({
      '/pods': { items: [] },
      '/services': { items: [] },
      '/replicasets': { items: [] },
      '/deployments': { items: [] },
      '/ingresses': { items: [] },
      '/routes': { items: [] },
      '/horizontalpodautoscalers': { items: [] },
      '/configmaps': { items: [] },
      '/secrets': { items: [] },
      '/poddisruptionbudgets': { items: [] },
      '/networkpolicies': { items: [] },
    });

    const graph = await buildDependencyGraph('Deployment', 'lonely', 'default');

    expect(graph.nodes.length).toBe(1);
    expect(graph.edges.length).toBe(0);
  });
});

describe('getNodeHref', () => {
  it('returns correct href for Pod', () => {
    expect(getNodeHref({ id: '', kind: 'Pod', name: 'my-pod', namespace: 'ns1' })).toBe('/workloads/pods/ns1/my-pod');
  });

  it('returns correct href for Deployment', () => {
    expect(getNodeHref({ id: '', kind: 'Deployment', name: 'my-dep', namespace: 'ns1' })).toBe('/workloads/deployments/ns1/my-dep');
  });

  it('returns correct href for Service', () => {
    expect(getNodeHref({ id: '', kind: 'Service', name: 'my-svc', namespace: 'ns1' })).toBe('/networking/services/ns1/my-svc');
  });

  it('returns undefined for unknown kind', () => {
    expect(getNodeHref({ id: '', kind: 'CustomThing', name: 'x', namespace: 'ns' })).toBeUndefined();
  });
});
