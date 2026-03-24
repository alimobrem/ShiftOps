// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) => {
    const state = { selectedNamespace: 'default', addTab: vi.fn() };
    return selector(state);
  },
}));

vi.mock('../../hooks/useNavigateTab', () => ({ useNavigateTab: () => vi.fn() }));
vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

let mockBuildResult: any = null;
let mockBuildDelay = false;
vi.mock('@/lib/dependencyGraph', () => ({
  buildDependencyGraph: vi.fn(() => {
    if (mockBuildDelay) return new Promise(() => {});
    return Promise.resolve(mockBuildResult);
  }),
}));

vi.mock('../../engine/gvr', () => ({
  resourceDetailUrl: ({ metadata }: any) => `/r/v1~pods/${metadata.namespace}/${metadata.name}`,
}));

vi.mock('../../components/primitives/Card', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
}));

import DependencyView from '../DependencyView';

function renderView(props: { gvrKey: string; namespace?: string; name: string }) {
  return render(
    <MemoryRouter>
      <DependencyView {...props} />
    </MemoryRouter>
  );
}

describe('DependencyView', () => {
  afterEach(() => {
    cleanup();
    mockBuildResult = null;
    mockBuildDelay = false;
  });

  it('shows loading state while building graph', () => {
    mockBuildDelay = true;
    renderView({ gvrKey: 'apps/v1/deployments', namespace: 'default', name: 'nginx' });
    expect(screen.getByText('Building dependency graph...')).toBeDefined();
  });

  it('shows message when namespace is not provided', async () => {
    renderView({ gvrKey: 'apps/v1/deployments', name: 'nginx' });
    // No namespace = immediate render with message
    await vi.waitFor(() => {
      expect(screen.getByText('Dependency graph requires a namespaced resource.')).toBeDefined();
    });
  });

  it('shows no-dependencies message when graph has single node', async () => {
    mockBuildResult = {
      rootId: 'Deployment/nginx',
      nodes: [{ id: 'Deployment/nginx', kind: 'Deployment', name: 'nginx', namespace: 'default' }],
      edges: [],
    };
    renderView({ gvrKey: 'apps/v1/deployments', namespace: 'default', name: 'nginx' });
    await vi.waitFor(() => {
      expect(screen.getByText('No dependencies found for this resource.')).toBeDefined();
    });
  });

  it('renders dependency heading and node count when graph has data', async () => {
    mockBuildResult = {
      rootId: 'Deployment/nginx',
      nodes: [
        { id: 'Deployment/nginx', kind: 'Deployment', name: 'nginx', namespace: 'default' },
        { id: 'ReplicaSet/nginx-abc', kind: 'ReplicaSet', name: 'nginx-abc', namespace: 'default' },
        { id: 'Pod/nginx-abc-xyz', kind: 'Pod', name: 'nginx-abc-xyz', namespace: 'default' },
      ],
      edges: [
        { from: 'Deployment/nginx', to: 'ReplicaSet/nginx-abc', relationship: 'owns' },
        { from: 'ReplicaSet/nginx-abc', to: 'Pod/nginx-abc-xyz', relationship: 'owns' },
      ],
    };
    renderView({ gvrKey: 'apps/v1/deployments', namespace: 'default', name: 'nginx' });
    await vi.waitFor(() => {
      expect(screen.getByText('Dependencies: nginx')).toBeDefined();
      expect(screen.getByText('3 resources, 2 relationships')).toBeDefined();
    });
  });

  it('renders kind legend badges for unique kinds', async () => {
    mockBuildResult = {
      rootId: 'Deployment/nginx',
      nodes: [
        { id: 'Deployment/nginx', kind: 'Deployment', name: 'nginx', namespace: 'default' },
        { id: 'Service/nginx-svc', kind: 'Service', name: 'nginx-svc', namespace: 'default' },
      ],
      edges: [
        { from: 'Deployment/nginx', to: 'Service/nginx-svc', relationship: 'exposes' },
      ],
    };
    renderView({ gvrKey: 'apps/v1/deployments', namespace: 'default', name: 'nginx' });
    await vi.waitFor(() => {
      expect(screen.getAllByText('Deployment').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Service').length).toBeGreaterThanOrEqual(1);
    });
  });
});
