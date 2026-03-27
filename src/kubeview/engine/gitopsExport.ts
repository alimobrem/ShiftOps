/**
 * GitOps Export — fetches cluster resources by category and commits them to git.
 */

import { k8sList } from './query';
import { jsonToYaml } from './yamlUtils';
import type { GitProvider, GitOpsConfig } from './gitProvider';
import type { K8sResource } from './renderers';

export interface ResourceCategory {
  id: string;
  label: string;
  apiPath: string;
  namespaced: boolean;
}

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  { id: 'deployments', label: 'Deployments', apiPath: '/apis/apps/v1/deployments', namespaced: true },
  { id: 'statefulsets', label: 'StatefulSets', apiPath: '/apis/apps/v1/statefulsets', namespaced: true },
  { id: 'daemonsets', label: 'DaemonSets', apiPath: '/apis/apps/v1/daemonsets', namespaced: true },
  { id: 'services', label: 'Services', apiPath: '/api/v1/services', namespaced: true },
  { id: 'configmaps', label: 'ConfigMaps', apiPath: '/api/v1/configmaps', namespaced: true },
  { id: 'secrets', label: 'Secrets', apiPath: '/api/v1/secrets', namespaced: true },
  { id: 'ingresses', label: 'Ingresses', apiPath: '/apis/networking.k8s.io/v1/ingresses', namespaced: true },
  { id: 'cronjobs', label: 'CronJobs', apiPath: '/apis/batch/v1/cronjobs', namespaced: true },
  { id: 'namespaces', label: 'Namespaces', apiPath: '/api/v1/namespaces', namespaced: false },
  { id: 'clusterroles', label: 'ClusterRoles', apiPath: '/apis/rbac.authorization.k8s.io/v1/clusterroles', namespaced: false },
];

/** Remove runtime-only fields for git storage. Unlike resourceToYaml, also strips status and resourceVersion. */
export function sanitizeForGitOps(resource: K8sResource): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...resource };

  delete clean._gvrKey;
  delete clean.status;

  if (clean.metadata && typeof clean.metadata === 'object') {
    const meta = { ...(clean.metadata as Record<string, unknown>) };
    delete meta.managedFields;
    delete meta.uid;
    delete meta.creationTimestamp;
    delete meta.generation;
    delete meta.selfLink;
    delete meta.resourceVersion;

    if (meta.annotations && typeof meta.annotations === 'object') {
      const annotations = { ...(meta.annotations as Record<string, unknown>) };
      delete annotations['kubectl.kubernetes.io/last-applied-configuration'];
      delete annotations['deployment.kubernetes.io/revision'];
      if (Object.keys(annotations).length === 0) {
        delete meta.annotations;
      } else {
        meta.annotations = annotations;
      }
    }

    clean.metadata = meta;
  }

  return clean;
}

export type ExportEventType = 'category-start' | 'file-committed' | 'category-done' | 'category-error' | 'complete';

export interface ExportEvent {
  type: ExportEventType;
  category: string;
  file?: string;
  fileCount?: number;
  totalFiles?: number;
  error?: string;
  prUrl?: string;
}

export interface ExportOptions {
  gitProvider: GitProvider;
  config: GitOpsConfig;
  branchName: string;
  clusterName: string;
  selectedCategories: string[];
  selectedNamespaces: string[];
  exportMode: 'branch' | 'pr';
  signal?: AbortSignal;
  onEvent: (event: ExportEvent) => void;
}

/**
 * Export cluster resources to git, emitting progress events.
 * Returns the PR URL if exportMode is 'pr'.
 */
export async function exportClusterToGit(options: ExportOptions): Promise<string | null> {
  const {
    gitProvider, config, branchName, clusterName,
    selectedCategories, selectedNamespaces, exportMode,
    signal, onEvent,
  } = options;

  const categories = RESOURCE_CATEGORIES.filter((c) => selectedCategories.includes(c.id));

  await gitProvider.createBranch(config.baseBranch, branchName);

  let totalFiles = 0;
  const pathPrefix = config.pathPrefix ? `${config.pathPrefix}/` : '';

  for (const category of categories) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    onEvent({ type: 'category-start', category: category.id });

    try {
      let resources: K8sResource[];
      if (category.namespaced && selectedNamespaces.length > 0 && !selectedNamespaces.includes('*')) {
        const batches = await Promise.all(
          selectedNamespaces.map((ns) => k8sList<K8sResource>(category.apiPath, ns)),
        );
        resources = batches.flat();
      } else {
        resources = await k8sList<K8sResource>(category.apiPath);
      }

      resources = resources.filter((r) => {
        const ns = r.metadata?.namespace || '';
        const name = r.metadata?.name || '';
        if (ns.startsWith('kube-') || ns.startsWith('openshift-')) return false;
        if (category.id === 'secrets' && name.includes('token')) return false;
        if (category.id === 'configmaps' && name === 'kube-root-ca.crt') return false;
        return true;
      });

      let categoryFiles = 0;

      for (const resource of resources) {
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

        const sanitized = sanitizeForGitOps(resource);
        const yaml = jsonToYaml(sanitized);
        const ns = resource.metadata?.namespace || '_cluster';
        const name = resource.metadata?.name || 'unknown';
        const filePath = `${pathPrefix}${clusterName}/${category.id}/${ns}/${name}.yaml`;

        await gitProvider.createOrUpdateFile(
          branchName, filePath, yaml,
          `Export ${category.label}: ${ns}/${name}`,
        );

        categoryFiles++;
        totalFiles++;
        onEvent({ type: 'file-committed', category: category.id, file: filePath, fileCount: categoryFiles });
      }

      onEvent({ type: 'category-done', category: category.id, fileCount: categoryFiles });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onEvent({ type: 'category-error', category: category.id, error: msg });
    }
  }

  let prUrl: string | null = null;
  if (exportMode === 'pr') {
    const pr = await gitProvider.createPullRequest(
      `[Pulse] Export cluster ${clusterName}`,
      `Exported ${totalFiles} resource files across ${categories.length} categories.\n\nGenerated by OpenShift Pulse.`,
      branchName,
      config.baseBranch,
    );
    prUrl = pr.url;
  }

  onEvent({ type: 'complete', category: '', totalFiles, prUrl: prUrl || undefined });
  return prUrl;
}
