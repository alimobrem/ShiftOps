/**
 * Shared hook for cluster health data — used by Pulse, Dashboard, Troubleshoot.
 * Uses standardized query keys so TanStack Query deduplicates across views.
 */

import { useQuery } from '@tanstack/react-query';
import { k8sList } from '../engine/query';
import type { K8sResource } from '../engine/renderers';

const REFETCH_INTERVAL = 30_000;

export function useClusterHealthData() {
  const nodes = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/nodes'],
    queryFn: () => k8sList<K8sResource>('/api/v1/nodes'),
    refetchInterval: REFETCH_INTERVAL,
  });

  const pods = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/pods'],
    queryFn: () => k8sList<K8sResource>('/api/v1/pods'),
    refetchInterval: REFETCH_INTERVAL,
  });

  const deployments = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/apis/apps/v1/deployments'],
    queryFn: () => k8sList<K8sResource>('/apis/apps/v1/deployments'),
    refetchInterval: REFETCH_INTERVAL,
  });

  const events = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/events'],
    queryFn: () => k8sList<K8sResource>('/api/v1/events?limit=100'),
    refetchInterval: REFETCH_INTERVAL,
  });

  const pvcs = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/persistentvolumeclaims'],
    queryFn: () => k8sList<K8sResource>('/api/v1/persistentvolumeclaims'),
    refetchInterval: REFETCH_INTERVAL,
  });

  return {
    nodes: nodes.data ?? [],
    pods: pods.data ?? [],
    deployments: deployments.data ?? [],
    events: events.data ?? [],
    pvcs: pvcs.data ?? [],
    isLoading: nodes.isLoading || pods.isLoading,
  };
}
