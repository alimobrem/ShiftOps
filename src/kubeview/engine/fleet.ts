/**
 * Fleet Engine — fan-out queries across all connected clusters.
 * Uses Promise.allSettled so one unreachable cluster doesn't block results.
 */

import { k8sList, k8sGet } from './query';
import { getAllConnections, type ClusterConnection } from './clusterConnection';
import type { K8sResource } from './renderers';

export interface FleetResult<T> {
  clusterId: string;
  clusterName: string;
  status: 'fulfilled' | 'rejected';
  data: T[];
  error?: string;
}

/**
 * List a resource type across all connected clusters.
 * Returns results grouped by cluster, with errors per-cluster.
 */
export async function fleetList<T extends K8sResource = K8sResource>(
  apiPath: string,
  namespace?: string,
): Promise<FleetResult<T>[]> {
  const clusters = getAllConnections().filter(c => c.status === 'connected');

  const results = await Promise.allSettled(
    clusters.map(async (cluster) => {
      const data = await k8sList<T>(apiPath, namespace, cluster.id);
      return { clusterId: cluster.id, clusterName: cluster.name, data };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return {
        clusterId: result.value.clusterId,
        clusterName: result.value.clusterName,
        status: 'fulfilled' as const,
        data: result.value.data,
      };
    }
    return {
      clusterId: clusters[i].id,
      clusterName: clusters[i].name,
      status: 'rejected' as const,
      data: [],
      error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
    };
  });
}

/**
 * Search for resources matching a name across all clusters.
 */
export async function fleetSearch<T extends K8sResource = K8sResource>(
  apiPath: string,
  searchTerm: string,
  namespace?: string,
): Promise<FleetResult<T>[]> {
  const results = await fleetList<T>(apiPath, namespace);

  return results.map(r => ({
    ...r,
    data: r.data.filter(resource =>
      resource.metadata.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  }));
}

/**
 * Get aggregate counts across all clusters for a resource type.
 */
export async function fleetCount(apiPath: string, namespace?: string): Promise<{
  total: number;
  perCluster: Array<{ clusterId: string; clusterName: string; count: number }>;
}> {
  const results = await fleetList(apiPath, namespace);

  const perCluster = results
    .filter(r => r.status === 'fulfilled')
    .map(r => ({ clusterId: r.clusterId, clusterName: r.clusterName, count: r.data.length }));

  return {
    total: perCluster.reduce((sum, c) => sum + c.count, 0),
    perCluster,
  };
}

