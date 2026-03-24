/**
 * Integration test utilities — shared setup for multi-component tests.
 * Uses MSW to mock the K8s API at the network level.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// --- K8s mock data factories ---

import type { Deployment, Pod, ConfigMap, Node } from '../engine/types';

export function makeDeployment(name: string, namespace = 'default', replicas = 1): Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      namespace,
      uid: `deploy-${name}`,
      creationTimestamp: '2026-01-01T00:00:00Z',
      labels: { app: name },
    },
    spec: {
      replicas,
      selector: { matchLabels: { app: name } },
      template: { metadata: { labels: { app: name } }, spec: { containers: [{ name, image: 'nginx:latest' }] } },
    },
    status: {
      replicas,
      readyReplicas: replicas,
      availableReplicas: replicas,
      conditions: [{ type: 'Available', status: 'True' }],
    },
  };
}

export function makePod(name: string, namespace = 'default', phase = 'Running'): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: `pod-${name}`,
      creationTimestamp: '2026-01-01T00:00:00Z',
      labels: { app: name.split('-')[0] },
    },
    spec: { containers: [{ name: 'main', image: 'nginx:latest' }] },
    status: {
      phase,
      containerStatuses: [{ name: 'main', ready: phase === 'Running', restartCount: 0, state: phase === 'Running' ? { running: {} } : { waiting: { reason: 'CrashLoopBackOff' } } }],
    },
  };
}

export function makeConfigMap(name: string, namespace = 'default'): ConfigMap {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace, uid: `cm-${name}`, creationTimestamp: '2026-01-01T00:00:00Z' },
    data: { key1: 'value1' },
  };
}

export function makeNode(name: string): Node {
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: { name, uid: `node-${name}`, creationTimestamp: '2026-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/worker': '' } },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      nodeInfo: { kubeletVersion: 'v1.30.0', operatingSystem: 'linux', architecture: 'amd64', containerRuntimeVersion: 'cri-o://1.30.0' },
    },
  };
}

export function wrapList(apiVersion: string, kind: string, items: any[]) {
  return {
    apiVersion,
    kind: kind + 'List',
    metadata: { resourceVersion: '12345' },
    items,
  };
}

// --- MSW server ---

export function createMockServer(handlers: ReturnType<typeof http.get | typeof http.post | typeof http.patch | typeof http.delete>[]) {
  return setupServer(...handlers);
}

// Common K8s API handlers
export function k8sHandlers(resources: { path: string; apiVersion: string; kind: string; items: any[] }[]) {
  const handlers: ReturnType<typeof http.get | typeof http.delete | typeof http.patch>[] = [];

  for (const r of resources) {
    // LIST
    handlers.push(
      http.get(`*/api/kubernetes${r.path}`, () => {
        return HttpResponse.json(wrapList(r.apiVersion, r.kind, r.items));
      })
    );

    // GET individual
    for (const item of r.items) {
      const name = item.metadata.name;
      const ns = item.metadata.namespace;
      const itemPath = ns ? `${r.path.replace(/\?.*/, '')}` : r.path;
      handlers.push(
        http.get(`*/api/kubernetes${itemPath}/${name}`, () => {
          return HttpResponse.json(item);
        })
      );
    }

    // DELETE
    handlers.push(
      http.delete(`*/api/kubernetes${r.path}/*`, ({ request }) => {
        const url = new URL(request.url);
        const name = url.pathname.split('/').pop();
        const idx = r.items.findIndex(i => i.metadata.name === name);
        if (idx !== -1) r.items.splice(idx, 1);
        return HttpResponse.json({ kind: 'Status', status: 'Success' });
      })
    );

    // PATCH (for scale-to-0)
    handlers.push(
      http.patch(`*/api/kubernetes${r.path}/*`, () => {
        return HttpResponse.json({ kind: 'Status', status: 'Success' });
      })
    );
  }

  return handlers;
}

// --- Render helpers ---

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  { route = '/', queryClient }: { route?: string; queryClient?: QueryClient } = {}
) {
  const qc = queryClient || createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}
