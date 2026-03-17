import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Puzzle, CheckCircle, XCircle, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sList } from '../engine/query';
import type { K8sResource } from '../engine/renderers';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';

export default function OperatorsView() {
  const navigate = useNavigate();
  const addTab = useUIStore((s) => s.addTab);
  const [filter, setFilter] = React.useState<'all' | 'degraded' | 'progressing'>('all');

  const { data: clusterOperators = [], isLoading } = useQuery<K8sResource[]>({
    queryKey: ['operators', 'clusteroperators'],
    queryFn: () => k8sList('/apis/config.openshift.io/v1/clusteroperators').catch(() => []),
    refetchInterval: 30000,
  });

  const operatorStatus = React.useMemo(() => {
    return clusterOperators.map((co: any) => {
      const conditions = co.status?.conditions || [];
      const available = conditions.find((c: any) => c.type === 'Available')?.status === 'True';
      const degraded = conditions.find((c: any) => c.type === 'Degraded')?.status === 'True';
      const progressing = conditions.find((c: any) => c.type === 'Progressing')?.status === 'True';
      const version = co.status?.versions?.find((v: any) => v.name === 'operator')?.version || '';
      const message = degraded
        ? conditions.find((c: any) => c.type === 'Degraded')?.message || ''
        : progressing
        ? conditions.find((c: any) => c.type === 'Progressing')?.message || ''
        : '';
      return { name: co.metadata.name, available, degraded, progressing, version, message };
    }).sort((a: any, b: any) => {
      if (a.degraded && !b.degraded) return -1;
      if (!a.degraded && b.degraded) return 1;
      if (a.progressing && !b.progressing) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [clusterOperators]);

  const degradedCount = operatorStatus.filter((o: any) => o.degraded).length;
  const progressingCount = operatorStatus.filter((o: any) => o.progressing).length;
  const availableCount = operatorStatus.filter((o: any) => o.available && !o.degraded).length;

  const filtered = React.useMemo(() => {
    if (filter === 'degraded') return operatorStatus.filter((o: any) => o.degraded);
    if (filter === 'progressing') return operatorStatus.filter((o: any) => o.progressing);
    return operatorStatus;
  }, [operatorStatus, filter]);

  const go = useNavigateTab(); // replaces local go()

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-violet-500" />
            Operators
          </h1>
          <p className="text-sm text-slate-400 mt-1">ClusterOperator health, versions, and status</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
            <div className="flex items-center gap-2 text-green-400 mb-1"><CheckCircle className="w-4 h-4" /><span className="text-xs">Available</span></div>
            <div className="text-xl font-bold text-slate-100">{availableCount}</div>
          </div>
          <div className={cn('bg-slate-900 rounded-lg border p-3', degradedCount > 0 ? 'border-red-800' : 'border-slate-800')}>
            <div className="flex items-center gap-2 text-red-400 mb-1"><XCircle className="w-4 h-4" /><span className="text-xs">Degraded</span></div>
            <div className="text-xl font-bold text-slate-100">{degradedCount}</div>
          </div>
          <div className={cn('bg-slate-900 rounded-lg border p-3', progressingCount > 0 ? 'border-yellow-800' : 'border-slate-800')}>
            <div className="flex items-center gap-2 text-yellow-400 mb-1"><RefreshCw className="w-4 h-4" /><span className="text-xs">Progressing</span></div>
            <div className="text-xl font-bold text-slate-100">{progressingCount}</div>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
          {(['all', 'degraded', 'progressing'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1.5 text-xs rounded-md transition-colors capitalize', filter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
              {f} ({f === 'all' ? operatorStatus.length : f === 'degraded' ? degradedCount : progressingCount})
            </button>
          ))}
        </div>

        <div className="bg-slate-900 rounded-lg border border-slate-800">
          <div className="divide-y divide-slate-800">
            {isLoading && <div className="p-8 text-center text-slate-500">Loading operators...</div>}
            {!isLoading && filtered.length === 0 && <div className="p-8 text-center text-slate-500">No operators match filter</div>}
            {filtered.map((op: any) => (
              <div key={op.name} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={() => go(`/r/config.openshift.io~v1~clusteroperators/_/${op.name}`, op.name)}>
                {op.degraded ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> :
                 op.progressing ? <RefreshCw className="w-4 h-4 text-yellow-500 flex-shrink-0 animate-spin" /> :
                 op.available ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                 <AlertCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{op.name}</span>
                    {op.version && <span className="text-xs text-slate-500 font-mono">{op.version}</span>}
                  </div>
                  {op.message && <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{op.message}</div>}
                </div>
                <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
