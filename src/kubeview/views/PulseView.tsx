import React, { useState, useMemo } from 'react';
import {
  HeartPulse, AlertCircle, XCircle, CheckCircle, Server, Box, Package,
  HardDrive, ArrowRight, Puzzle, Shield,
  Search, FileText, ChevronDown, ChevronRight, Loader2,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { K8sResource } from '../engine/renderers';
import { getPodStatus, getNodeStatus, getDeploymentStatus } from '../engine/renderers/statusUtils';
import { diagnoseResource, type Diagnosis } from '../engine/diagnosis';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';
import { resourceDetailUrl } from '../engine/gvr';
import { useK8sListWatch } from '../hooks/useK8sListWatch';
import { ReportTab } from './pulse/ReportTab';

function filterByNamespace<T extends { metadata: { namespace?: string } }>(items: T[], ns: string): T[] {
  if (ns === '*') return items;
  return items.filter((i) => i.metadata.namespace === ns);
}

type Tab = 'report' | 'issues' | 'runbooks';

interface DiagnosedResource {
  resource: K8sResource;
  diagnoses: Diagnosis[];
  maxSeverity: 'critical' | 'warning' | 'info';
}

export default function PulseView() {
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const urlTab = new URLSearchParams(window.location.search).get('tab') as Tab;
  const [activeTab, setActiveTabState] = useState<Tab>(urlTab || 'report');
  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    if (tab === 'report') url.searchParams.delete('tab'); else url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.toString());
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedResource, setExpandedResource] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning'>('all');

  // Core resource queries
  const nsFilter = selectedNamespace !== '*' ? selectedNamespace : undefined;
  const { data: nodes = [] } = useK8sListWatch({ apiPath: '/api/v1/nodes' });
  const { data: pods = [], isLoading: podsLoading } = useK8sListWatch({ apiPath: '/api/v1/pods', namespace: nsFilter });
  const { data: deployments = [] } = useK8sListWatch({ apiPath: '/apis/apps/v1/deployments', namespace: nsFilter });
  const { data: pvcs = [] } = useK8sListWatch({ apiPath: '/api/v1/persistentvolumeclaims', namespace: nsFilter });
  const { data: operators = [] } = useK8sListWatch({ apiPath: '/apis/config.openshift.io/v1/clusteroperators' });

  const filteredPods = React.useMemo(() => filterByNamespace(pods as any[], selectedNamespace), [pods, selectedNamespace]);
  const filteredDeployments = React.useMemo(() => filterByNamespace(deployments as any[], selectedNamespace), [deployments, selectedNamespace]);
  const filteredPVCs = React.useMemo(() => filterByNamespace(pvcs as any[], selectedNamespace), [pvcs, selectedNamespace]);

  // Diagnosis (for Issues tab)
  const diagnosedResources = useMemo<DiagnosedResource[]>(() => {
    const all = [...filteredPods, ...filteredDeployments, ...nodes, ...filteredPVCs];
    const results: DiagnosedResource[] = [];
    for (const resource of all) {
      const diagnoses = diagnoseResource(resource);
      if (diagnoses.length > 0) {
        const hasCritical = diagnoses.some((d) => d.severity === 'critical');
        const hasWarning = diagnoses.some((d) => d.severity === 'warning');
        results.push({ resource, diagnoses, maxSeverity: hasCritical ? 'critical' : hasWarning ? 'warning' : 'info' });
      }
    }
    return results.sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.maxSeverity] - { critical: 0, warning: 1, info: 2 }[b.maxSeverity]));
  }, [filteredPods, filteredDeployments, nodes, filteredPVCs]);

  const filteredDiagnosedResources = useMemo(() => {
    let results = diagnosedResources;
    if (filter !== 'all') results = results.filter((r) => r.maxSeverity === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter((r) =>
        r.resource.metadata.name.toLowerCase().includes(q) ||
        r.resource.kind.toLowerCase().includes(q) ||
        r.resource.metadata.namespace?.toLowerCase().includes(q) ||
        r.diagnoses.some((d) => d.title.toLowerCase().includes(q))
      );
    }
    return results;
  }, [diagnosedResources, filter, searchQuery]);

  const criticalCount = diagnosedResources.filter((r) => r.maxSeverity === 'critical').length;
  const warningCount = diagnosedResources.filter((r) => r.maxSeverity === 'warning').length;
  const isLoading = podsLoading;

  // Runbooks
  const runbooks = [
    { id: 'crashloop', title: 'Pod CrashLoopBackOff', icon: '🔄', severity: 'critical' as const,
      count: filteredPods.filter((p) => getPodStatus(p).reason === 'CrashLoopBackOff').length,
      steps: ['Check pod logs for error messages', 'Verify image exists and is pullable', 'Check resource limits (OOM kills)', 'Review liveness probe configuration', 'Check for missing ConfigMaps/Secrets'] },
    { id: 'imagepull', title: 'Image Pull Failures', icon: '📦', severity: 'critical' as const,
      count: filteredPods.filter((p) => getPodStatus(p).reason === 'ImagePullBackOff' || getPodStatus(p).reason === 'ErrImagePull').length,
      steps: ['Verify image name and tag are correct', 'Check registry credentials (imagePullSecrets)', 'Verify network connectivity to registry', 'Check if image exists in the registry'] },
    { id: 'pending', title: 'Pods Stuck Pending', icon: '⏳', severity: 'warning' as const,
      count: filteredPods.filter((p) => getPodStatus(p).phase === 'Pending').length,
      steps: ['Check node resources (CPU/memory available)', 'Review node taints and pod tolerations', 'Check nodeSelector and affinity rules', 'Verify PVC is bound if volumes are used', 'Check resource quotas in the namespace'] },
    { id: 'deploy', title: 'Deployment Unavailable', icon: '🚫', severity: 'warning' as const,
      count: filteredDeployments.filter((d) => !getDeploymentStatus(d).available).length,
      steps: ['Check pod status in the deployment', 'Review deployment events', 'Verify image and pull policy', 'Check for resource quota limits', 'Review rollout history for recent changes'] },
    { id: 'node', title: 'Node Not Ready', icon: '🖥️', severity: 'critical' as const,
      count: nodes.filter((n) => !getNodeStatus(n).ready).length,
      steps: ['Check kubelet status on the node', 'Review node conditions (DiskPressure, MemoryPressure)', 'Check network connectivity to control plane', 'Review system logs (journalctl -u kubelet)', 'Check for certificate expiration'] },
    { id: 'pvc', title: 'PVC Stuck Pending', icon: '💾', severity: 'warning' as const,
      count: filteredPVCs.filter((p) => (p.status as any)?.phase === 'Pending').length,
      steps: ['Check if StorageClass exists and is valid', 'Verify storage provisioner is running', 'Check if PVs are available (for static provisioning)', 'Review storage class parameters', 'Check cloud provider quotas'] },
  ];

  const kindIcon: Record<string, React.ReactNode> = {
    Pod: <Box className="w-4 h-4" />, Deployment: <Package className="w-4 h-4" />,
    Node: <Server className="w-4 h-4" />, PersistentVolumeClaim: <HardDrive className="w-4 h-4" />,
  };

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-blue-500" />
            Cluster Pulse
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Cluster health report, diagnosed issues, and troubleshooting runbooks
            {selectedNamespace !== '*' && <span className="text-blue-400 ml-1">· {selectedNamespace}</span>}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
          {([
            { id: 'report' as Tab, label: 'Report', icon: <Shield className="w-3.5 h-3.5" /> },
            { id: 'issues' as Tab, label: `Issues (${diagnosedResources.length})`, icon: <AlertCircle className="w-3.5 h-3.5" /> },
            { id: 'runbooks' as Tab, label: 'Runbooks', icon: <FileText className="w-3.5 h-3.5" /> },
          ]).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors', activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* === REPORT TAB === */}
        {activeTab === 'report' && (
          <ReportTab nodes={nodes as K8sResource[]} allPods={pods as K8sResource[]} operators={operators as K8sResource[]} go={go} />
        )}

        {/* === ISSUES TAB === */}
        {activeTab === 'issues' && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, kind, namespace, or issue..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex bg-slate-900 rounded-lg border border-slate-700 text-xs">
                {(['all', 'critical', 'warning'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-2 capitalize transition-colors', filter === f ? (f === 'critical' ? 'bg-red-600 text-white rounded-lg' : f === 'warning' ? 'bg-yellow-600 text-white rounded-lg' : 'bg-blue-600 text-white rounded-lg') : 'text-slate-400 hover:text-slate-200')}>
                    {f} ({f === 'critical' ? criticalCount : f === 'warning' ? warningCount : diagnosedResources.length})
                  </button>
                ))}
              </div>
            </div>

            {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /><span className="ml-3 text-slate-400">Scanning resources...</span></div>}

            {!isLoading && filteredDiagnosedResources.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-slate-300 font-medium">{diagnosedResources.length === 0 ? 'No issues detected' : 'No matching issues'}</p>
                <p className="text-xs text-slate-500 mt-1">All scanned resources are healthy</p>
              </div>
            )}

            <div className="space-y-2">
              {filteredDiagnosedResources.map((item) => {
                const isExpanded = expandedResource === item.resource.metadata.uid;
                return (
                  <div key={item.resource.metadata.uid} className={cn('bg-slate-900 rounded-lg border transition-colors', item.maxSeverity === 'critical' ? 'border-red-900/50' : 'border-slate-800')}>
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => setExpandedResource(isExpanded ? null : item.resource.metadata.uid || null)}>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      {item.maxSeverity === 'critical' ? <XCircle className="w-5 h-5 text-red-500" /> : <AlertCircle className="w-5 h-5 text-yellow-500" />}
                      <div className="flex items-center gap-2 text-slate-400">{kindIcon[item.resource.kind] || <Box className="w-4 h-4" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200 truncate">{item.resource.metadata.name}</span>
                          <span className="text-xs text-slate-500">{item.resource.kind}</span>
                          {item.resource.metadata.namespace && <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{item.resource.metadata.namespace}</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{item.diagnoses[0].title}{item.diagnoses.length > 1 && ` (+${item.diagnoses.length - 1} more)`}</div>
                      </div>
                      <span className={cn('text-xs px-2 py-0.5 rounded', item.maxSeverity === 'critical' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300')}>
                        {item.diagnoses.length} issue{item.diagnoses.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-800 px-4 py-3 space-y-3">
                        {item.diagnoses.map((d, idx) => (
                          <div key={idx} className="flex items-start gap-3 py-2">
                            {d.severity === 'critical' ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />}
                            <div className="flex-1">
                              <div className="text-sm font-medium text-slate-200">{d.title}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{d.detail}</div>
                              {d.suggestion && <div className="text-xs text-blue-400 mt-1">💡 {d.suggestion}</div>}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                          <button onClick={() => go(resourceDetailUrl(item.resource), item.resource.metadata.name)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 text-slate-200 rounded hover:bg-slate-700">
                            <FileText className="w-3 h-3" /> Details
                          </button>
                          {item.resource.metadata.namespace && (
                            <button onClick={() => { const gvrUrl = resourceDetailUrl(item.resource).replace(/^\/r\//, '').split('/')[0]; go(`/deps/${gvrUrl}/${item.resource.metadata.namespace}/${item.resource.metadata.name}`, `${item.resource.metadata.name} (Deps)`); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 text-slate-200 rounded hover:bg-slate-700">
                              <GitBranch className="w-3 h-3" /> Dependencies
                            </button>
                          )}
                          {item.resource.kind === 'Pod' && item.resource.metadata.namespace && (
                            <button onClick={() => go(`/logs/${item.resource.metadata.namespace}/${item.resource.metadata.name}`, `${item.resource.metadata.name} (Logs)`)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500">
                              <FileText className="w-3 h-3" /> View Logs
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* === RUNBOOKS TAB === */}
        {activeTab === 'runbooks' && (
          <div className="space-y-4">
            {runbooks.map((rb) => {
              const affected = rb.id === 'crashloop' ? filteredPods.filter((p) => getPodStatus(p).reason === 'CrashLoopBackOff') :
                rb.id === 'imagepull' ? filteredPods.filter((p) => getPodStatus(p).reason === 'ImagePullBackOff' || getPodStatus(p).reason === 'ErrImagePull') :
                rb.id === 'pending' ? filteredPods.filter((p) => getPodStatus(p).phase === 'Pending') :
                rb.id === 'deploy' ? filteredDeployments.filter((d) => !getDeploymentStatus(d).available) :
                rb.id === 'node' ? nodes.filter((n) => !getNodeStatus(n).ready) :
                rb.id === 'pvc' ? filteredPVCs.filter((p) => (p.status as any)?.phase === 'Pending') : [];

              return (
                <div key={rb.id} className={cn('bg-slate-900 rounded-lg border', rb.count > 0 ? (rb.severity === 'critical' ? 'border-red-900/50' : 'border-yellow-900/50') : 'border-slate-800')}>
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <span>{rb.icon}</span>
                      {rb.title}
                    </h3>
                    {rb.count > 0 ? (
                      <span className={cn('text-xs px-2 py-0.5 rounded font-medium', rb.severity === 'critical' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300')}>{rb.count} affected</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-300 rounded">None</span>
                    )}
                  </div>
                  {affected.length > 0 && (
                    <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/50">
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Affected Resources</div>
                      <div className="space-y-1">
                        {affected.slice(0, 3).map((r) => (
                          <div key={r.metadata.uid} onClick={() => go(resourceDetailUrl(r), r.metadata.name)} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/50 cursor-pointer text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              <span className="text-slate-200">{r.metadata.name}</span>
                              {r.metadata.namespace && <span className="text-slate-500">{r.metadata.namespace}</span>}
                            </div>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                          </div>
                        ))}
                        {affected.length > 3 && <div className="text-xs text-slate-500 px-2">+{affected.length - 3} more</div>}
                      </div>
                    </div>
                  )}
                  <div className="p-4">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Investigation Steps</div>
                    <ol className="space-y-2">
                      {rb.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs">
                          <span className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5', rb.count === 0 ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-400')}>{rb.count === 0 ? '✓' : i + 1}</span>
                          <span className={cn('leading-relaxed', rb.count === 0 ? 'text-slate-500 line-through' : 'text-slate-300')}>{step}</span>
                        </li>
                      ))}
                    </ol>
                    {rb.count > 0 && affected.length > 0 && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-800">
                        <button onClick={() => go(resourceDetailUrl(affected[0]), affected[0].metadata.name)} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
                          Investigate first resource →
                        </button>
                        {affected[0].kind === 'Pod' && affected[0].metadata.namespace && (
                          <button onClick={() => go(`/logs/${affected[0].metadata.namespace}/${affected[0].metadata.name}`, `${affected[0].metadata.name} (Logs)`)} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors">
                            View Logs
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
