import React from 'react';
import { GitBranch, RefreshCw, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArgoCD, useArgoCDRefresh } from '../hooks/useArgoCD';
import { useArgoCDStore } from '../store/argoCDStore';
import { useNavigateTab } from '../hooks/useNavigateTab';
import { k8sPatch } from '../engine/query';
import { useUIStore } from '../store/uiStore';
import { Card } from '../components/primitives/Card';
import { MetricGrid } from '../components/primitives/MetricGrid';
import { ApplicationsTab } from './argocd/ApplicationsTab';
import { SyncHistoryTab } from './argocd/SyncHistoryTab';
import { DriftTab } from './argocd/DriftTab';

type Tab = 'applications' | 'history' | 'drift';

export default function ArgoCDView() {
  const go = useNavigateTab();
  const addToast = useUIStore((s) => s.addToast);
  const { available, detecting, applications, applicationsLoading, namespace } = useArgoCD();
  const refresh = useArgoCDRefresh();
  const [activeTab, setActiveTab] = React.useState<Tab>('applications');
  const [syncing, setSyncing] = React.useState<string | null>(null);

  const outOfSyncCount = applications.filter(a => a.status?.sync?.status === 'OutOfSync').length;
  const degradedCount = applications.filter(a => a.status?.health?.status === 'Degraded').length;

  const handleSync = async (appName: string, appNs: string) => {
    setSyncing(appName);
    try {
      await k8sPatch(`/apis/argoproj.io/v1alpha1/namespaces/${appNs}/applications/${appName}`, {
        operation: {
          initiatedBy: { username: 'pulse', automated: false },
          sync: { revision: 'HEAD' },
        },
      });
      addToast({ type: 'success', title: 'Sync triggered', detail: `Application ${appName} is syncing` });
      setTimeout(() => refresh(), 3000);
    } catch (err) {
      addToast({ type: 'error', title: 'Sync failed', detail: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSyncing(null);
    }
  };

  // Not available — show info
  if (!available && !detecting) {
    return (
      <div className="h-full overflow-auto bg-slate-950 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Info className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">ArgoCD is not installed on this cluster</p>
              <p className="text-slate-500 text-xs mt-1">Install OpenShift GitOps or ArgoCD to enable GitOps features</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'applications', label: `Applications (${applications.length})` },
    { id: 'history', label: 'Sync History' },
    { id: 'drift', label: `Drift${outOfSyncCount > 0 ? ` (${outOfSyncCount})` : ''}` },
  ];

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <GitBranch className="w-6 h-6 text-violet-500" />
              GitOps
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              ArgoCD Applications, sync status, and drift detection
              {namespace && <span className="text-violet-400 ml-1">· {namespace}</span>}
            </p>
          </div>
          <button
            onClick={() => refresh()}
            disabled={applicationsLoading}
            className="px-3 py-1.5 text-xs text-slate-400 rounded hover:bg-slate-800 hover:text-slate-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', applicationsLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Summary */}
        <MetricGrid>
          <Card className="p-3">
            <div className="text-xs text-slate-400 mb-1">Applications</div>
            <div className="text-xl font-bold text-slate-100">{applications.length}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-slate-400 mb-1">Synced</div>
            <div className="text-xl font-bold text-emerald-400">
              {applications.filter(a => a.status?.sync?.status === 'Synced').length}
            </div>
          </Card>
          <Card className={cn('p-3', outOfSyncCount > 0 && 'border-amber-800')}>
            <div className="text-xs text-slate-400 mb-1">Out of Sync</div>
            <div className={cn('text-xl font-bold', outOfSyncCount > 0 ? 'text-amber-400' : 'text-slate-400')}>
              {outOfSyncCount}
            </div>
          </Card>
          <Card className={cn('p-3', degradedCount > 0 && 'border-red-800')}>
            <div className="text-xs text-slate-400 mb-1">Degraded</div>
            <div className={cn('text-xl font-bold', degradedCount > 0 ? 'text-red-400' : 'text-slate-400')}>
              {degradedCount}
            </div>
          </Card>
        </MetricGrid>

        {/* Tabs */}
        <Card className="flex gap-1 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap',
                activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </Card>

        {/* Loading */}
        {(detecting || applicationsLoading) && applications.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'applications' && (
              <ApplicationsTab
                applications={applications}
                syncing={syncing}
                onSync={handleSync}
                go={go}
              />
            )}
            {activeTab === 'history' && (
              <SyncHistoryTab applications={applications} go={go} />
            )}
            {activeTab === 'drift' && (
              <DriftTab applications={applications} onSync={handleSync} syncing={syncing} go={go} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
