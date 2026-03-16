import { describe, it, expect } from 'vitest';
import {
  gvrKey,
  groupResources,
  findResource,
  getAPIPath,
  supportsVerb,
  clearDiscoveryCache,
  type ResourceType,
  type ResourceRegistry,
} from '../discovery';

function makeResource(overrides: Partial<ResourceType> = {}): ResourceType {
  return {
    group: '',
    version: 'v1',
    kind: 'Pod',
    plural: 'pods',
    singularName: 'pod',
    namespaced: true,
    verbs: ['get', 'list', 'create', 'update', 'delete', 'watch'],
    shortNames: ['po'],
    categories: ['all'],
    ...overrides,
  };
}

function buildRegistry(): ResourceRegistry {
  const registry: ResourceRegistry = new Map();
  registry.set('core/v1/pods', makeResource());
  registry.set('core/v1/nodes', makeResource({
    kind: 'Node',
    plural: 'nodes',
    singularName: 'node',
    namespaced: false,
    shortNames: ['no'],
    categories: [],
  }));
  registry.set('core/v1/services', makeResource({
    kind: 'Service',
    plural: 'services',
    singularName: 'service',
    shortNames: ['svc'],
  }));
  registry.set('apps/v1/deployments', makeResource({
    group: 'apps',
    kind: 'Deployment',
    plural: 'deployments',
    singularName: 'deployment',
    shortNames: ['deploy'],
  }));
  registry.set('batch/v1/jobs', makeResource({
    group: 'batch',
    kind: 'Job',
    plural: 'jobs',
    singularName: 'job',
    shortNames: [],
  }));
  return registry;
}

describe('discovery', () => {
  describe('gvrKey', () => {
    it('builds core resource key with core/ prefix', () => {
      expect(gvrKey('', 'v1', 'pods')).toBe('core/v1/pods');
    });

    it('builds grouped resource key', () => {
      expect(gvrKey('apps', 'v1', 'deployments')).toBe('apps/v1/deployments');
    });

    it('handles custom groups', () => {
      expect(gvrKey('networking.k8s.io', 'v1', 'networkpolicies'))
        .toBe('networking.k8s.io/v1/networkpolicies');
    });
  });

  describe('groupResources', () => {
    it('groups resources by API group', () => {
      const registry = buildRegistry();
      const groups = groupResources(registry);

      expect(groups.length).toBeGreaterThanOrEqual(3);

      const coreGroup = groups.find((g) => g.name === '');
      expect(coreGroup).toBeDefined();
      expect(coreGroup!.displayName).toBe('Core');
      expect(coreGroup!.resources.length).toBe(3); // pods, nodes, services
    });

    it('sorts core group first', () => {
      const registry = buildRegistry();
      const groups = groupResources(registry);

      expect(groups[0].name).toBe('');
      expect(groups[0].displayName).toBe('Core');
    });

    it('sorts non-core groups alphabetically', () => {
      const registry = buildRegistry();
      const groups = groupResources(registry);

      const nonCore = groups.filter((g) => g.name !== '');
      for (let i = 1; i < nonCore.length; i++) {
        expect(nonCore[i].name >= nonCore[i - 1].name).toBe(true);
      }
    });

    it('sorts resources within groups by kind', () => {
      const registry = buildRegistry();
      const groups = groupResources(registry);
      const coreGroup = groups.find((g) => g.name === '')!;

      const kinds = coreGroup.resources.map((r) => r.kind);
      expect(kinds).toEqual([...kinds].sort());
    });

    it('formats group display names', () => {
      const registry = buildRegistry();
      const groups = groupResources(registry);

      const appsGroup = groups.find((g) => g.name === 'apps');
      expect(appsGroup?.displayName).toBe('Apps');

      const batchGroup = groups.find((g) => g.name === 'batch');
      expect(batchGroup?.displayName).toBe('Batch');
    });
  });

  describe('findResource', () => {
    it('finds by kind', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'Deployment');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds by kind case-insensitive', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'deployment');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds by plural name', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'deployments');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds by singular name', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'deployment');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds by short name', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'deploy');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds by GVR key', () => {
      const registry = buildRegistry();
      const result = findResource(registry, 'apps/v1/deployments');
      expect(result?.kind).toBe('Deployment');
    });

    it('finds core resources by short name', () => {
      const registry = buildRegistry();
      expect(findResource(registry, 'po')?.kind).toBe('Pod');
      expect(findResource(registry, 'no')?.kind).toBe('Node');
      expect(findResource(registry, 'svc')?.kind).toBe('Service');
    });

    it('returns undefined for unknown resource', () => {
      const registry = buildRegistry();
      expect(findResource(registry, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getAPIPath', () => {
    it('builds core API path', () => {
      const resource = makeResource();
      expect(getAPIPath(resource)).toBe('/api/v1/pods');
    });

    it('builds core API path with namespace', () => {
      const resource = makeResource();
      expect(getAPIPath(resource, 'default')).toBe('/api/v1/namespaces/default/pods');
    });

    it('builds grouped API path', () => {
      const resource = makeResource({ group: 'apps', plural: 'deployments' });
      expect(getAPIPath(resource)).toBe('/apis/apps/v1/deployments');
    });

    it('builds grouped API path with namespace', () => {
      const resource = makeResource({ group: 'apps', plural: 'deployments' });
      expect(getAPIPath(resource, 'production')).toBe('/apis/apps/v1/namespaces/production/deployments');
    });

    it('does not add namespace for cluster-scoped resources', () => {
      const resource = makeResource({ plural: 'nodes', namespaced: false });
      expect(getAPIPath(resource, 'default')).toBe('/api/v1/nodes');
    });
  });

  describe('supportsVerb', () => {
    it('returns true for supported verbs', () => {
      const resource = makeResource();
      expect(supportsVerb(resource, 'get')).toBe(true);
      expect(supportsVerb(resource, 'list')).toBe(true);
      expect(supportsVerb(resource, 'delete')).toBe(true);
    });

    it('returns false for unsupported verbs', () => {
      const resource = makeResource({ verbs: ['get', 'list'] });
      expect(supportsVerb(resource, 'delete')).toBe(false);
      expect(supportsVerb(resource, 'create')).toBe(false);
    });
  });

  describe('clearDiscoveryCache', () => {
    it('does not throw', () => {
      expect(() => clearDiscoveryCache()).not.toThrow();
    });
  });
});
