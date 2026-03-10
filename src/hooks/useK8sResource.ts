import { useState, useEffect } from 'react';
import { useClusterStore } from '@/store/useClusterStore';

interface UseK8sResourceResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const BASE = '/api/kubernetes';

async function fetchList<T>(path: string): Promise<T[]> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json() as { items: T[] };
  return json.items ?? [];
}

/**
 * Builds a namespace-scoped API path when a namespace is selected.
 * Converts e.g. `/api/v1/pods` → `/api/v1/namespaces/myns/pods`
 * and `/apis/apps/v1/deployments` → `/apis/apps/v1/namespaces/myns/deployments`
 * Leaves cluster-scoped paths (nodes, pvs, namespaces, crds, etc.) unchanged.
 */
function scopePathToNamespace(apiPath: string, namespace: string): string {
  if (namespace === 'all') return apiPath;

  // Already namespace-scoped in the path
  if (apiPath.includes('/namespaces/')) return apiPath;

  // Cluster-scoped resources — don't scope
  const clusterScoped = ['/nodes', '/persistentvolumes', '/namespaces', '/clusterroles', '/clusterrolebindings',
    '/customresourcedefinitions', '/storageclasses', '/clusteroperators', '/clusterversions', '/infrastructures',
    '/helmchartrepositories', '/packagemanifests'];
  if (clusterScoped.some((cs) => apiPath.endsWith(cs))) return apiPath;

  // /api/v1/pods → /api/v1/namespaces/{ns}/pods
  const apiV1Match = apiPath.match(/^(\/api\/v1)\/(\w+)$/);
  if (apiV1Match) return `${apiV1Match[1]}/namespaces/${namespace}/${apiV1Match[2]}`;

  // /apis/apps/v1/deployments → /apis/apps/v1/namespaces/{ns}/deployments
  const apisMatch = apiPath.match(/^(\/apis\/[^/]+\/[^/]+)\/(\w+)$/);
  if (apisMatch) return `${apisMatch[1]}/namespaces/${namespace}/${apisMatch[2]}`;

  return apiPath;
}

export function useK8sResource<TRaw, TOut>(
  apiPath: string,
  transform: (item: TRaw) => TOut,
  pollInterval?: number,
): UseK8sResourceResult<TOut> {
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const [data, setData] = useState<TOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  const scopedPath = scopePathToNamespace(apiPath, selectedNamespace);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const items = await fetchList<TRaw>(scopedPath);
        if (!cancelled) {
          setData(items.map(transform));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (pollInterval) {
      interval = setInterval(load, pollInterval);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [scopedPath, tick]);

  return { data, loading, error, refetch };
}

// Helper to compute age from timestamp
export function ageFromTimestamp(ts: string | undefined): string {
  if (!ts) return '-';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(diff / 60000);
  return `${mins}m`;
}

// Common K8s metadata shape
export interface K8sMeta {
  metadata: {
    name: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    uid?: string;
  };
}
