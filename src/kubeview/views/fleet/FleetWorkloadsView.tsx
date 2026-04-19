/**
 * FleetWorkloadsView -- aggregated workload overview across all connected clusters.
 * Shows summary cards (total deployments, pods, failed pods) and a per-cluster breakdown table.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Globe, Box, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fleetList } from '../../engine/fleet';
import { useFleetStore } from '../../store/fleetStore';
import { useNavigateTab } from '../../hooks/useNavigateTab';
import { Card, CardHeader, CardBody } from '../../components/primitives/Card';
import { MetricGrid } from '../../components/primitives/MetricGrid';
import type { K8sResource } from '../../engine/renderers/index';

interface ClusterWorkloadSummary {
  clusterId: string;
  clusterName: string;
  deployments: number;
  pods: number;
  failedPods: number;
  unhealthyDeploys: number;
  error?: string;
}

function isPodFailed(pod: K8sResource): boolean {
  const phase = (pod.status as Record<string, unknown>)?.phase;
  return phase === 'Failed';
}

function isDeployUnhealthy(deploy: K8sResource): boolean {
  const status = deploy.status as Record<string, unknown> | undefined;
  if (!status) return false;
  const replicas = (status.replicas as number) || 0;
  const ready = (status.readyReplicas as number) || 0;
  return replicas > 0 && ready < replicas;
}

export default function FleetWorkloadsView() {
  const go = useNavigateTab();
  const setActiveCluster = useFleetStore((s) => s.setActiveCluster);

  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<ClusterWorkloadSummary[]>([]);

  const fetchWorkloads = useCallback(async () => {
    setLoading(true);
    try {
      const [deployResults, podResults] = await Promise.all([
        fleetList<K8sResource>('/apis/apps/v1/deployments'),
        fleetList<K8sResource>('/api/v1/pods'),
      ]);

      // Build per-cluster map
      const clusterMap = new Map<string, ClusterWorkloadSummary>();

      for (const dr of deployResults) {
        clusterMap.set(dr.clusterId, {
          clusterId: dr.clusterId,
          clusterName: dr.clusterName,
          deployments: dr.status === 'fulfilled' ? dr.data.length : 0,
          pods: 0,
          failedPods: 0,
          unhealthyDeploys: dr.status === 'fulfilled'
            ? dr.data.filter(isDeployUnhealthy).length
            : 0,
          error: dr.error,
        });
      }

      for (const pr of podResults) {
        const existing = clusterMap.get(pr.clusterId);
        if (existing) {
          existing.pods = pr.status === 'fulfilled' ? pr.data.length : 0;
          existing.failedPods = pr.status === 'fulfilled'
            ? pr.data.filter(isPodFailed).length
            : 0;
          if (!existing.error && pr.error) existing.error = pr.error;
        } else {
          clusterMap.set(pr.clusterId, {
            clusterId: pr.clusterId,
            clusterName: pr.clusterName,
            deployments: 0,
            pods: pr.status === 'fulfilled' ? pr.data.length : 0,
            failedPods: pr.status === 'fulfilled'
              ? pr.data.filter(isPodFailed).length
              : 0,
            unhealthyDeploys: 0,
            error: pr.error,
          });
        }
      }

      setSummaries(Array.from(clusterMap.values()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkloads(); }, [fetchWorkloads]);

  const totals = useMemo(() => {
    let deployments = 0, pods = 0, failedPods = 0, unhealthyDeploys = 0;
    for (const s of summaries) {
      deployments += s.deployments;
      pods += s.pods;
      failedPods += s.failedPods;
      unhealthyDeploys += s.unhealthyDeploys;
    }
    return { deployments, pods, failedPods, unhealthyDeploys };
  }, [summaries]);

  const handleClusterClick = (clusterId: string, clusterName: string) => {
    setActiveCluster(clusterId);
    go('/workloads', `${clusterName} -- Workloads`);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-2">
          <Globe className="w-10 h-10 text-slate-700 mx-auto" />
          <p className="text-slate-400 text-sm">No clusters connected</p>
          <p className="text-slate-600 text-xs">Connect clusters in the Fleet view to see fleet-wide workloads.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            Fleet Workloads
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Aggregated workload overview across {summaries.length} cluster{summaries.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Summary cards */}
        <MetricGrid>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Layers className="w-3.5 h-3.5" />
              Total Deployments
            </div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">{totals.deployments}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Box className="w-3.5 h-3.5" />
              Total Pods
            </div>
            <div className="text-2xl font-bold text-slate-100 tabular-nums">{totals.pods}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              Failed Pods
            </div>
            <div className={cn('text-2xl font-bold tabular-nums', totals.failedPods > 0 ? 'text-red-400' : 'text-slate-100')}>
              {totals.failedPods}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Unhealthy Deploys
            </div>
            <div className={cn('text-2xl font-bold tabular-nums', totals.unhealthyDeploys > 0 ? 'text-amber-400' : 'text-slate-100')}>
              {totals.unhealthyDeploys}
            </div>
          </Card>
        </MetricGrid>

        {/* Per-cluster breakdown */}
        <Card>
          <CardHeader title="Per-Cluster Breakdown" icon={<Globe className="w-4 h-4" />} />
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400">
                  <th className="px-4 py-2 text-left font-medium">Cluster</th>
                  <th className="px-4 py-2 text-right font-medium">Deployments</th>
                  <th className="px-4 py-2 text-right font-medium">Pods</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 text-right font-medium">Unhealthy Deploys</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr
                    key={s.clusterId}
                    onClick={() => handleClusterClick(s.clusterId, s.clusterName)}
                    className="border-b border-slate-800 hover:bg-slate-800/70 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-200 font-medium">{s.clusterName}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300 font-mono">{s.deployments}</td>
                    <td className="px-4 py-2.5 text-right text-slate-300 font-mono">{s.pods}</td>
                    <td className={cn('px-4 py-2.5 text-right font-mono', s.failedPods > 0 ? 'text-red-400' : 'text-slate-300')}>
                      {s.failedPods}
                    </td>
                    <td className={cn('px-4 py-2.5 text-right font-mono', s.unhealthyDeploys > 0 ? 'text-amber-400' : 'text-slate-300')}>
                      {s.unhealthyDeploys}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
