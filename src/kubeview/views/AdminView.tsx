import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Settings, Server, Puzzle, FileCode, Shield, Database, ArrowRight,
  CheckCircle, XCircle, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sList, k8sGet } from '../engine/query';
import type { K8sResource } from '../engine/renderers';
import { useNavigateTab } from '../hooks/useNavigateTab';

type Tab = 'overview' | 'quotas' | 'settings';

export default function AdminView() {
  const [activeTab, setActiveTab] = React.useState<Tab>('overview');

  // Cluster version
  const { data: clusterVersion } = useQuery({
    queryKey: ['admin', 'clusterversion'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/clusterversions/version').catch(() => null),
    staleTime: 60000,
  });

  // Infrastructure
  const { data: infra } = useQuery({
    queryKey: ['admin', 'infra'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/infrastructures/cluster').catch(() => null),
    staleTime: 60000,
  });

  // Nodes
  const { data: nodes = [] } = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/nodes'],
    queryFn: () => k8sList('/api/v1/nodes'),
    refetchInterval: 30000,
  });

  // ClusterOperators
  const { data: operators = [] } = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/apis/config.openshift.io/v1/clusteroperators'],
    queryFn: () => k8sList('/apis/config.openshift.io/v1/clusteroperators').catch(() => []),
    refetchInterval: 30000,
  });

  // CRDs
  const { data: crds = [] } = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'],
    queryFn: () => k8sList('/apis/apiextensions.k8s.io/v1/customresourcedefinitions'),
    staleTime: 60000,
  });

  // Resource Quotas
  const { data: quotas = [] } = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/resourcequotas'],
    queryFn: () => k8sList('/api/v1/resourcequotas'),
    staleTime: 60000,
  });

  // Limit Ranges
  const { data: limitRanges = [] } = useQuery<K8sResource[]>({
    queryKey: ['k8s', 'list', '/api/v1/limitranges'],
    queryFn: () => k8sList('/api/v1/limitranges'),
    staleTime: 60000,
  });

  // Cluster config resources
  const { data: oauthConfig } = useQuery({
    queryKey: ['admin', 'oauth'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/oauths/cluster').catch(() => null),
    staleTime: 120000,
  });

  // Computed values
  const cvVersion = clusterVersion?.status?.desired?.version || clusterVersion?.status?.history?.[0]?.version || '';
  const cvChannel = clusterVersion?.spec?.channel || '';
  const platform = infra?.status?.platform || infra?.status?.platformStatus?.type || '';
  const apiUrl = infra?.status?.apiServerURL || '';

  const opDegraded = operators.filter((o: any) => o.status?.conditions?.find((c: any) => c.type === 'Degraded' && c.status === 'True')).length;
  const opProgressing = operators.filter((o: any) => o.status?.conditions?.find((c: any) => c.type === 'Progressing' && c.status === 'True')).length;

  const nodeRoles = React.useMemo(() => {
    const roles = new Map<string, number>();
    for (const n of nodes) {
      const labels = n.metadata.labels || {};
      for (const [k] of Object.entries(labels)) {
        if (k.startsWith('node-role.kubernetes.io/')) {
          const role = k.replace('node-role.kubernetes.io/', '');
          roles.set(role, (roles.get(role) || 0) + 1);
        }
      }
    }
    return [...roles.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const crdGroups = React.useMemo(() => {
    const groups = new Map<string, number>();
    for (const crd of crds) {
      const group = (crd.spec as any)?.group || 'unknown';
      groups.set(group, (groups.get(group) || 0) + 1);
    }
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [crds]);

  const identityProviders = React.useMemo(() => {
    return (oauthConfig?.spec?.identityProviders || []) as Array<{ name: string; type: string }>;
  }, [oauthConfig]);

  const go = useNavigateTab(); // replaces local go()

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'quotas', label: `Quotas (${quotas.length})`, icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'Settings', icon: <Database className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-400" />
            Administration
          </h1>
          <p className="text-sm text-slate-400 mt-1">Cluster configuration, nodes, operators, and resources</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap', activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoCard label="Cluster Version" value={cvVersion || '—'} sub={cvChannel} />
              <InfoCard label="Platform" value={platform || '—'} sub={apiUrl ? new URL(apiUrl).hostname : ''} />
              <InfoCard label="Nodes" value={String(nodes.length)} sub={`${nodeRoles.map(([r, c]) => `${c} ${r}`).join(', ')}`} />
              <InfoCard label="CRDs" value={String(crds.length)} sub={`${crdGroups.length} API groups`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title={`Operators (${operators.length})`} icon={<Puzzle className="w-4 h-4 text-violet-500" />}>
                <div className="flex items-center gap-4 mb-3">
                  <span className="flex items-center gap-1.5 text-sm"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> {operators.length - opDegraded - opProgressing} healthy</span>
                  {opDegraded > 0 && <span className="flex items-center gap-1.5 text-sm text-red-400"><XCircle className="w-3.5 h-3.5" /> {opDegraded} degraded</span>}
                  {opProgressing > 0 && <span className="flex items-center gap-1.5 text-sm text-yellow-400"><RefreshCw className="w-3.5 h-3.5" /> {opProgressing} progressing</span>}
                </div>
                <button onClick={() => go('/operators', 'Operators')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  View all operators <ArrowRight className="w-3 h-3" />
                </button>
              </Panel>

              <Panel title="Identity Providers" icon={<Shield className="w-4 h-4 text-teal-500" />}>
                {identityProviders.length === 0 ? (
                  <div className="text-sm text-slate-500 py-2">No identity providers configured</div>
                ) : (
                  <div className="space-y-1">
                    {identityProviders.map((idp, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-800/50">
                        <span className="text-sm text-slate-200">{idp.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded">{idp.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={`Nodes (${nodes.length})`} icon={<Server className="w-4 h-4 text-blue-500" />}>
                <div className="space-y-2 mb-3">
                  {nodeRoles.map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{role}</span>
                      <span className="text-sm font-mono text-slate-400">{count}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => go('/r/v1~nodes', 'Nodes')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  View all nodes <ArrowRight className="w-3 h-3" />
                </button>
              </Panel>

              <Panel title="Resource Quotas & Limits" icon={<Shield className="w-4 h-4 text-orange-500" />}>
                <div className="flex items-center gap-4">
                  <div><span className="text-xl font-bold text-slate-100">{quotas.length}</span><span className="text-xs text-slate-500 ml-1">Quotas</span></div>
                  <div><span className="text-xl font-bold text-slate-100">{limitRanges.length}</span><span className="text-xs text-slate-500 ml-1">LimitRanges</span></div>
                </div>
                <button onClick={() => setActiveTab('quotas')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2">
                  View details <ArrowRight className="w-3 h-3" />
                </button>
              </Panel>
            </div>

            {/* Quick links to dedicated views */}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => go('/r/apiextensions.k8s.io~v1~customresourcedefinitions', 'CRDs')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <FileCode className="w-3 h-3" /> Browse {crds.length} CRDs <ArrowRight className="w-3 h-3" />
              </button>
              <span className="text-slate-700">·</span>
              <button onClick={() => go('/access-control', 'Access Control')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Access Control <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </>
        )}

        {/* Quotas */}
        {activeTab === 'quotas' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title={`Resource Quotas (${quotas.length})`} icon={<Shield className="w-4 h-4 text-orange-500" />}>
              {quotas.length === 0 ? <div className="text-sm text-slate-500 py-4 text-center">No resource quotas</div> : (
                <div className="space-y-1 max-h-80 overflow-auto">
                  {quotas.map((q) => {
                    const hard = (q.spec as any)?.hard || {};
                    return (
                      <div key={q.metadata.uid} className="py-2 px-2 rounded hover:bg-slate-800/50 cursor-pointer" onClick={() => go(`/r/v1~resourcequotas/${q.metadata.namespace}/${q.metadata.name}`, q.metadata.name)}>
                        <div className="flex items-center gap-2"><span className="text-sm text-slate-200">{q.metadata.name}</span><span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{q.metadata.namespace}</span></div>
                        <div className="text-xs text-slate-500 mt-0.5">{Object.keys(hard).join(', ')}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
            <Panel title={`Limit Ranges (${limitRanges.length})`} icon={<Shield className="w-4 h-4 text-yellow-500" />}>
              {limitRanges.length === 0 ? <div className="text-sm text-slate-500 py-4 text-center">No limit ranges</div> : (
                <div className="space-y-1 max-h-80 overflow-auto">
                  {limitRanges.map((lr) => {
                    const limits = ((lr.spec as any)?.limits || []) as Array<{ type: string }>;
                    return (
                      <div key={lr.metadata.uid} className="py-2 px-2 rounded hover:bg-slate-800/50 cursor-pointer" onClick={() => go(`/r/v1~limitranges/${lr.metadata.namespace}/${lr.metadata.name}`, lr.metadata.name)}>
                        <div className="flex items-center gap-2"><span className="text-sm text-slate-200">{lr.metadata.name}</span><span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{lr.metadata.namespace}</span></div>
                        <div className="text-xs text-slate-500 mt-0.5">{limits.map((l) => l.type).join(', ')}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <Panel title="Cluster Configuration" icon={<Settings className="w-4 h-4 text-slate-400" />}>
              <div className="space-y-2">
                <SettingsRow label="Cluster Version" value={cvVersion} />
                <SettingsRow label="Update Channel" value={cvChannel} />
                <SettingsRow label="Platform" value={platform} />
                <SettingsRow label="API Server" value={apiUrl} />
                <SettingsRow label="Cluster ID" value={clusterVersion?.spec?.clusterID || '—'} mono />
              </div>
            </Panel>
            <Panel title="Update History" icon={<RefreshCw className="w-4 h-4 text-blue-500" />}>
              <div className="space-y-1 max-h-64 overflow-auto">
                {(clusterVersion?.status?.history || []).slice(0, 10).map((h: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2">
                    <div className="flex items-center gap-2">
                      {h.state === 'Completed' ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <RefreshCw className="w-3.5 h-3.5 text-yellow-500" />}
                      <span className="text-sm text-slate-200 font-mono">{h.version}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{h.state}</span>
                      {h.completionTime && <span>{new Date(h.completionTime).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-100 truncate">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800">
      <div className="px-4 py-3 border-b border-slate-800"><h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">{icon}{title}</h2></div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SettingsRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-4 py-1.5">
      <span className="text-xs text-slate-400 w-32 flex-shrink-0">{label}</span>
      <span className={cn('text-xs text-slate-200 break-all', mono && 'font-mono')}>{value || '—'}</span>
    </div>
  );
}
