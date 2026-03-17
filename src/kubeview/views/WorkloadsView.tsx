import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Box, Layers, Database, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sList } from '../engine/query';
import type { K8sResource } from '../engine/renderers';
import { getDeploymentStatus } from '../engine/renderers/statusUtils';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';

export default function WorkloadsView() {
  const navigate = useNavigate();
  const addTab = useUIStore((s) => s.addTab);
  const [activeTab, setActiveTab] = React.useState<'all' | 'unhealthy'>('all');

  const { data: deployments = [] } = useQuery<K8sResource[]>({
    queryKey: ['workloads', 'deployments'],
    queryFn: () => k8sList('/apis/apps/v1/deployments'),
    refetchInterval: 30000,
  });

  const { data: statefulSets = [] } = useQuery<K8sResource[]>({
    queryKey: ['workloads', 'statefulsets'],
    queryFn: () => k8sList('/apis/apps/v1/statefulsets'),
    refetchInterval: 30000,
  });

  const { data: daemonSets = [] } = useQuery<K8sResource[]>({
    queryKey: ['workloads', 'daemonsets'],
    queryFn: () => k8sList('/apis/apps/v1/daemonsets'),
    refetchInterval: 30000,
  });

  const { data: jobs = [] } = useQuery<K8sResource[]>({
    queryKey: ['workloads', 'jobs'],
    queryFn: () => k8sList('/apis/batch/v1/jobs'),
    staleTime: 30000,
  });

  const { data: cronJobs = [] } = useQuery<K8sResource[]>({
    queryKey: ['workloads', 'cronjobs'],
    queryFn: () => k8sList('/apis/batch/v1/cronjobs'),
    staleTime: 30000,
  });

  const allWorkloads = React.useMemo(() => {
    const items: Array<{ resource: K8sResource; kind: string; healthy: boolean; ready: string; image: string }> = [];

    for (const d of deployments) {
      const s = getDeploymentStatus(d);
      const spec = d.spec as any;
      const image = spec?.template?.spec?.containers?.[0]?.image || '';
      items.push({ resource: d, kind: 'Deployment', healthy: s.available, ready: `${s.ready}/${s.desired}`, image: image.split('/').pop() || image });
    }
    for (const ss of statefulSets) {
      const status = ss.status as any;
      const ready = status?.readyReplicas ?? 0;
      const desired = (ss.spec as any)?.replicas ?? 0;
      const image = (ss.spec as any)?.template?.spec?.containers?.[0]?.image || '';
      items.push({ resource: ss, kind: 'StatefulSet', healthy: ready === desired && desired > 0, ready: `${ready}/${desired}`, image: image.split('/').pop() || image });
    }
    for (const ds of daemonSets) {
      const status = ds.status as any;
      const ready = status?.numberReady ?? 0;
      const desired = status?.desiredNumberScheduled ?? 0;
      items.push({ resource: ds, kind: 'DaemonSet', healthy: ready === desired && desired > 0, ready: `${ready}/${desired}`, image: '' });
    }

    return items.sort((a, b) => {
      if (!a.healthy && b.healthy) return -1;
      if (a.healthy && !b.healthy) return 1;
      return a.resource.metadata.name.localeCompare(b.resource.metadata.name);
    });
  }, [deployments, statefulSets, daemonSets]);

  const unhealthyCount = allWorkloads.filter((w) => !w.healthy).length;
  const filtered = activeTab === 'unhealthy' ? allWorkloads.filter((w) => !w.healthy) : allWorkloads;

  const go = useNavigateTab(); // replaces local go()
  function gvrForKind(kind: string) {
    const map: Record<string, string> = { Deployment: 'apps~v1~deployments', StatefulSet: 'apps~v1~statefulsets', DaemonSet: 'apps~v1~daemonsets' };
    return map[kind] || 'apps~v1~deployments';
  }

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-500" />
            Workloads
          </h1>
          <p className="text-sm text-slate-400 mt-1">Deployments, StatefulSets, DaemonSets, Jobs, and CronJobs</p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="Deployments" value={deployments.length} icon={<Package className="w-4 h-4" />} onClick={() => go('/r/apps~v1~deployments', 'Deployments')} />
          <StatCard label="StatefulSets" value={statefulSets.length} icon={<Database className="w-4 h-4" />} onClick={() => go('/r/apps~v1~statefulsets', 'StatefulSets')} />
          <StatCard label="DaemonSets" value={daemonSets.length} icon={<Layers className="w-4 h-4" />} onClick={() => go('/r/apps~v1~daemonsets', 'DaemonSets')} />
          <StatCard label="Jobs" value={jobs.length} icon={<Box className="w-4 h-4" />} onClick={() => go('/r/batch~v1~jobs', 'Jobs')} />
          <StatCard label="CronJobs" value={cronJobs.length} icon={<Clock className="w-4 h-4" />} onClick={() => go('/r/batch~v1~cronjobs', 'CronJobs')} />
        </div>

        <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
          <button onClick={() => setActiveTab('all')} className={cn('px-3 py-1.5 text-xs rounded-md transition-colors', activeTab === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400')}>
            All ({allWorkloads.length})
          </button>
          <button onClick={() => setActiveTab('unhealthy')} className={cn('px-3 py-1.5 text-xs rounded-md transition-colors', activeTab === 'unhealthy' ? 'bg-red-600 text-white' : 'text-slate-400')}>
            Unhealthy ({unhealthyCount})
          </button>
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-800">
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-auto">
            {filtered.slice(0, 50).map((w) => (
              <div
                key={w.resource.metadata.uid}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/50 cursor-pointer transition-colors"
                onClick={() => go(`/r/${gvrForKind(w.kind)}/${w.resource.metadata.namespace}/${w.resource.metadata.name}`, w.resource.metadata.name)}
              >
                {w.healthy ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">{w.resource.metadata.name}</span>
                    <span className="text-xs text-slate-500">{w.kind}</span>
                  </div>
                  {w.resource.metadata.namespace && (
                    <span className="text-xs text-slate-500">{w.resource.metadata.namespace}</span>
                  )}
                </div>
                {w.image && <span className="text-xs text-slate-500 font-mono truncate max-w-[200px]">{w.image}</span>}
                <span className={cn('text-xs font-mono font-semibold', w.healthy ? 'text-green-400' : 'text-red-400')}>{w.ready}</span>
                <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, onClick }: { label: string; value: number; icon: React.ReactNode; onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-slate-900 rounded-lg border border-slate-800 p-3 cursor-pointer hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-2 text-slate-400 mb-1">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}
