import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Globe, Network, Shield, ArrowRight, ExternalLink, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sList } from '../engine/query';
import type { K8sResource } from '../engine/renderers';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';

export default function NetworkingView() {
  const navigate = useNavigate();
  const addTab = useUIStore((s) => s.addTab);

  const { data: services = [] } = useQuery<K8sResource[]>({
    queryKey: ['networking', 'services'],
    queryFn: () => k8sList('/api/v1/services'),
    staleTime: 30000,
  });

  const { data: ingresses = [] } = useQuery<K8sResource[]>({
    queryKey: ['networking', 'ingresses'],
    queryFn: () => k8sList('/apis/networking.k8s.io/v1/ingresses'),
    staleTime: 30000,
  });

  const { data: routes = [] } = useQuery<K8sResource[]>({
    queryKey: ['networking', 'routes'],
    queryFn: () => k8sList('/apis/route.openshift.io/v1/routes').catch(() => []),
    staleTime: 30000,
  });

  const { data: networkPolicies = [] } = useQuery<K8sResource[]>({
    queryKey: ['networking', 'networkpolicies'],
    queryFn: () => k8sList('/apis/networking.k8s.io/v1/networkpolicies'),
    staleTime: 30000,
  });

  const svcTypes = React.useMemo(() => {
    const counts = { ClusterIP: 0, NodePort: 0, LoadBalancer: 0, ExternalName: 0 };
    for (const s of services) { const t = (s.spec as any)?.type || 'ClusterIP'; if (t in counts) (counts as any)[t]++; }
    return counts;
  }, [services]);

  const exposedEndpoints = React.useMemo(() => {
    const endpoints: Array<{ type: string; name: string; ns: string; host: string; path: string }> = [];
    for (const ing of ingresses as any[]) {
      for (const rule of ing.spec?.rules || []) {
        for (const p of rule.http?.paths || []) {
          endpoints.push({ type: 'Ingress', name: ing.metadata.name, ns: ing.metadata.namespace, host: rule.host || '*', path: p.path || '/' });
        }
      }
    }
    for (const route of routes as any[]) {
      endpoints.push({ type: 'Route', name: route.metadata.name, ns: route.metadata.namespace, host: route.spec?.host || '', path: route.spec?.path || '/' });
    }
    return endpoints;
  }, [ingresses, routes]);

  const npByNamespace = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const np of networkPolicies) { const ns = np.metadata.namespace || ''; map.set(ns, (map.get(ns) || 0) + 1); }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [networkPolicies]);

  const go = useNavigateTab(); // replaces local go()

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Globe className="w-6 h-6 text-cyan-500" />
            Networking
          </h1>
          <p className="text-sm text-slate-400 mt-1">Services, ingress, routes, and network policies</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Services" value={services.length} onClick={() => go('/r/v1~services', 'Services')} />
          <StatCard label="Ingresses" value={ingresses.length} onClick={() => go('/r/networking.k8s.io~v1~ingresses', 'Ingresses')} />
          <StatCard label="Routes" value={routes.length} onClick={() => go('/r/route.openshift.io~v1~routes', 'Routes')} />
          <StatCard label="Network Policies" value={networkPolicies.length} onClick={() => go('/r/networking.k8s.io~v1~networkpolicies', 'NetworkPolicies')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Service types */}
          <Panel title="Service Types" icon={<Network className="w-4 h-4 text-green-500" />}>
            <div className="space-y-3">
              {Object.entries(svcTypes).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2.5 h-2.5 rounded-full', type === 'LoadBalancer' ? 'bg-green-500' : type === 'NodePort' ? 'bg-purple-500' : type === 'ExternalName' ? 'bg-orange-500' : 'bg-blue-500')} />
                    <span className="text-sm text-slate-300">{type}</span>
                  </div>
                  <span className="text-sm font-mono text-slate-400">{count}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* Network policies */}
          <Panel title={`Network Policies by Namespace (${networkPolicies.length})`} icon={<Shield className="w-4 h-4 text-red-500" />}>
            {npByNamespace.length === 0 ? (
              <div className="text-center py-4 text-sm text-slate-500">No network policies found</div>
            ) : (
              <div className="space-y-2">
                {npByNamespace.map(([ns, count]) => (
                  <div key={ns} className="flex items-center justify-between py-1">
                    <span className="text-sm text-slate-300">{ns}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${(count / networkPolicies.length) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 font-mono w-4 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Exposed endpoints */}
        <Panel title={`Exposed Endpoints (${exposedEndpoints.length})`} icon={<ExternalLink className="w-4 h-4 text-purple-500" />}>
          {exposedEndpoints.length === 0 ? (
            <div className="text-center py-4 text-sm text-slate-500">No ingresses or routes found</div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {exposedEndpoints.slice(0, 20).map((ep, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    {ep.type === 'Route' ? <Globe className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" /> : <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                    <span className="text-sm text-slate-200 truncate">{ep.host}{ep.path}</span>
                    <span className="text-xs text-slate-500">{ep.type}</span>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded flex-shrink-0">{ep.ns}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-slate-900 rounded-lg border border-slate-800 p-3 cursor-pointer hover:border-slate-600 transition-colors">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800">
      <div className="px-4 py-3 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">{icon}{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
