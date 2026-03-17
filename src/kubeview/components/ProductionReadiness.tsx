import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle, XCircle, AlertTriangle, Shield, Server, HardDrive,
  Network, Users, Activity, Bell, FileText, Lock, RefreshCw,
  ArrowRight, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sGet, k8sList } from '../engine/query';
import { useNavigateTab } from '../hooks/useNavigateTab';

interface Check {
  id: string;
  category: string;
  title: string;
  description: string;
  status: 'pass' | 'fail' | 'warn' | 'loading' | 'unknown';
  detail?: string;
  action?: { label: string; path: string };
}

export default function ProductionReadiness() {
  const go = useNavigateTab();

  // Fetch all the data we need
  const { data: nodes = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/api/v1/nodes'],
    queryFn: () => k8sList('/api/v1/nodes'),
    staleTime: 60000,
  });

  const { data: clusterVersion } = useQuery({
    queryKey: ['admin', 'clusterversion'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/clusterversions/version').catch(() => null),
    staleTime: 60000,
  });

  const { data: oauth } = useQuery({
    queryKey: ['admin', 'config', 'oauth'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/oauths/cluster').catch(() => null),
    staleTime: 60000,
  });

  const { data: apiServer } = useQuery({
    queryKey: ['admin', 'config', 'apiserver'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/apiservers/cluster').catch(() => null),
    staleTime: 60000,
  });

  const { data: storageClasses = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/apis/storage.k8s.io/v1/storageclasses'],
    queryFn: () => k8sList('/apis/storage.k8s.io/v1/storageclasses').catch(() => []),
    staleTime: 60000,
  });

  const { data: netpols = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/apis/networking.k8s.io/v1/networkpolicies'],
    queryFn: () => k8sList('/apis/networking.k8s.io/v1/networkpolicies').catch(() => []),
    staleTime: 60000,
  });

  const { data: quotas = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/api/v1/resourcequotas'],
    queryFn: () => k8sList('/api/v1/resourcequotas').catch(() => []),
    staleTime: 60000,
  });

  const { data: healthChecks = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/apis/machine.openshift.io/v1beta1/machinehealthchecks'],
    queryFn: () => k8sList('/apis/machine.openshift.io/v1beta1/machinehealthchecks').catch(() => []),
    staleTime: 60000,
  });

  const { data: clusterAutoscaler = [] } = useQuery<any[]>({
    queryKey: ['k8s', 'list', '/apis/autoscaling.openshift.io/v1/clusterautoscalers'],
    queryFn: () => k8sList('/apis/autoscaling.openshift.io/v1/clusterautoscalers').catch(() => []),
    staleTime: 60000,
  });

  const { data: kubeadminSecret } = useQuery({
    queryKey: ['readiness', 'kubeadmin'],
    queryFn: () => k8sGet<any>('/api/v1/namespaces/kube-system/secrets/kubeadmin').then(() => true).catch(() => false),
    staleTime: 60000,
  });

  const { data: monitoringPods = [] } = useQuery<any[]>({
    queryKey: ['readiness', 'monitoring'],
    queryFn: () => k8sList('/api/v1/namespaces/openshift-monitoring/pods').catch(() => []),
    staleTime: 60000,
  });

  const { data: logForwarder } = useQuery({
    queryKey: ['readiness', 'logforwarder'],
    queryFn: () => k8sList('/apis/logging.openshift.io/v1/clusterlogforwarders').then((items: any[]) => items.length > 0).catch(() => false),
    staleTime: 60000,
  });

  const { data: ingress } = useQuery({
    queryKey: ['admin', 'config', 'ingress'],
    queryFn: () => k8sGet<any>('/apis/config.openshift.io/v1/ingresses/cluster').catch(() => null),
    staleTime: 60000,
  });

  // --- Run checks ---
  const checks = React.useMemo<Check[]>(() => {
    const results: Check[] = [];

    // INFRASTRUCTURE
    const controlPlaneNodes = nodes.filter((n: any) => {
      const labels = n.metadata?.labels || {};
      return Object.keys(labels).some(k => k.includes('master') || k.includes('control-plane'));
    });
    results.push({
      id: 'ha-control-plane', category: 'Infrastructure',
      title: 'High Availability Control Plane',
      description: 'At least 3 control plane nodes for fault tolerance',
      status: controlPlaneNodes.length >= 3 ? 'pass' : controlPlaneNodes.length > 0 ? 'warn' : 'fail',
      detail: `${controlPlaneNodes.length} control plane node${controlPlaneNodes.length !== 1 ? 's' : ''}`,
      action: { label: 'View Nodes', path: '/compute' },
    });

    const workerNodes = nodes.filter((n: any) => {
      const labels = n.metadata?.labels || {};
      return Object.keys(labels).some(k => k.includes('worker'));
    });
    results.push({
      id: 'worker-nodes', category: 'Infrastructure',
      title: 'Dedicated Worker Nodes',
      description: 'At least 2 worker nodes for workload scheduling',
      status: workerNodes.length >= 2 ? 'pass' : workerNodes.length > 0 ? 'warn' : 'fail',
      detail: `${workerNodes.length} worker node${workerNodes.length !== 1 ? 's' : ''}`,
      action: { label: 'View Nodes', path: '/compute' },
    });

    results.push({
      id: 'autoscaling', category: 'Infrastructure',
      title: 'Cluster Autoscaling',
      description: 'ClusterAutoscaler configured for automatic node scaling',
      status: clusterAutoscaler.length > 0 ? 'pass' : 'warn',
      detail: clusterAutoscaler.length > 0 ? 'Configured' : 'Not configured',
      action: { label: 'Configure', path: '/compute' },
    });

    results.push({
      id: 'machine-health', category: 'Infrastructure',
      title: 'Machine Health Checks',
      description: 'Automatic remediation of unhealthy machines',
      status: healthChecks.length > 0 ? 'pass' : 'warn',
      detail: `${healthChecks.length} health check${healthChecks.length !== 1 ? 's' : ''}`,
      action: { label: 'View', path: '/compute' },
    });

    // STORAGE
    const defaultSC = storageClasses.find((sc: any) =>
      sc.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true'
    );
    results.push({
      id: 'storage-class', category: 'Storage',
      title: 'Storage Classes Available',
      description: 'At least one StorageClass for dynamic volume provisioning',
      status: storageClasses.length > 0 ? 'pass' : 'fail',
      detail: `${storageClasses.length} StorageClass${storageClasses.length !== 1 ? 'es' : ''}`,
      action: { label: 'View Storage', path: '/storage' },
    });

    results.push({
      id: 'default-storage', category: 'Storage',
      title: 'Default StorageClass Set',
      description: 'A default StorageClass so PVCs work without specifying one',
      status: defaultSC ? 'pass' : storageClasses.length > 0 ? 'warn' : 'fail',
      detail: defaultSC ? defaultSC.metadata.name : 'No default set',
      action: { label: 'View Storage', path: '/storage' },
    });

    // SECURITY
    const identityProviders = oauth?.spec?.identityProviders || [];
    results.push({
      id: 'identity-providers', category: 'Security',
      title: 'Identity Providers Configured',
      description: 'External authentication (LDAP, GitHub, OpenID) instead of kubeadmin',
      status: identityProviders.length > 0 ? 'pass' : 'fail',
      detail: identityProviders.length > 0 ? identityProviders.map((p: any) => p.name).join(', ') : 'No providers — using kubeadmin only',
      action: { label: 'Configure', path: '/admin' },
    });

    results.push({
      id: 'kubeadmin-removed', category: 'Security',
      title: 'Kubeadmin Secret Removed',
      description: 'Remove kubeadmin after configuring identity providers',
      status: kubeadminSecret === false ? 'pass' : kubeadminSecret === true ? 'warn' : 'unknown',
      detail: kubeadminSecret === false ? 'Removed' : kubeadminSecret === true ? 'Still exists — remove after configuring IdP' : 'Checking...',
    });

    const tlsProfile = apiServer?.spec?.tlsSecurityProfile?.type || 'Intermediate';
    results.push({
      id: 'tls-profile', category: 'Security',
      title: 'TLS Security Profile',
      description: 'Intermediate or Modern TLS (not Old)',
      status: tlsProfile === 'Old' ? 'fail' : 'pass',
      detail: `${tlsProfile} profile`,
      action: { label: 'Configure', path: '/admin' },
    });

    const encryption = apiServer?.spec?.encryption?.type;
    results.push({
      id: 'encryption', category: 'Security',
      title: 'Encryption at Rest',
      description: 'Encrypt etcd data (secrets, configmaps)',
      status: encryption && encryption !== 'identity' ? 'pass' : 'warn',
      detail: encryption ? `Type: ${encryption}` : 'Not configured (data stored unencrypted)',
      action: { label: 'Configure', path: '/admin' },
    });

    const userNsWithNetpol = new Set(netpols.filter((np: any) => !np.metadata?.namespace?.startsWith('openshift-') && !np.metadata?.namespace?.startsWith('kube-')).map((np: any) => np.metadata?.namespace));
    results.push({
      id: 'network-policies', category: 'Security',
      title: 'Network Policies',
      description: 'Restrict pod-to-pod traffic in user namespaces',
      status: userNsWithNetpol.size > 0 ? 'pass' : 'warn',
      detail: `${userNsWithNetpol.size} namespace${userNsWithNetpol.size !== 1 ? 's' : ''} with policies`,
      action: { label: 'View Networking', path: '/networking' },
    });

    // OBSERVABILITY
    const prometheusPods = monitoringPods.filter((p: any) => p.metadata?.name?.includes('prometheus'));
    results.push({
      id: 'monitoring', category: 'Observability',
      title: 'Monitoring Stack',
      description: 'Prometheus and Alertmanager running',
      status: prometheusPods.length > 0 ? 'pass' : 'fail',
      detail: `${prometheusPods.length} Prometheus pod${prometheusPods.length !== 1 ? 's' : ''}`,
      action: { label: 'View Alerts', path: '/alerts' },
    });

    results.push({
      id: 'log-forwarding', category: 'Observability',
      title: 'Log Forwarding',
      description: 'Forward logs to external system (Elasticsearch, Splunk, etc.)',
      status: logForwarder ? 'pass' : 'warn',
      detail: logForwarder ? 'Configured' : 'Not configured — logs only available on cluster',
    });

    const auditProfile = apiServer?.spec?.audit?.profile || 'Default';
    results.push({
      id: 'audit-logging', category: 'Observability',
      title: 'Audit Logging',
      description: 'API server audit logging enabled',
      status: auditProfile === 'None' ? 'fail' : 'pass',
      detail: `Profile: ${auditProfile}`,
    });

    // RELIABILITY
    const userQuotas = quotas.filter((q: any) => !q.metadata?.namespace?.startsWith('openshift-') && !q.metadata?.namespace?.startsWith('kube-'));
    results.push({
      id: 'resource-quotas', category: 'Reliability',
      title: 'Resource Quotas',
      description: 'Prevent resource abuse in user namespaces',
      status: userQuotas.length > 0 ? 'pass' : 'warn',
      detail: `${userQuotas.length} quota${userQuotas.length !== 1 ? 's' : ''} in user namespaces`,
      action: { label: 'View Quotas', path: '/admin' },
    });

    const channel = clusterVersion?.spec?.channel || '';
    results.push({
      id: 'update-channel', category: 'Reliability',
      title: 'Stable Update Channel',
      description: 'Use stable channel (not candidate or fast) for production',
      status: channel.startsWith('stable') ? 'pass' : channel.startsWith('fast') ? 'warn' : channel ? 'fail' : 'unknown',
      detail: channel || 'No channel set',
      action: { label: 'Change Channel', path: '/admin' },
    });

    const availableUpdates = clusterVersion?.status?.availableUpdates || [];
    results.push({
      id: 'cluster-updated', category: 'Reliability',
      title: 'Cluster Up to Date',
      description: 'No pending cluster updates',
      status: availableUpdates.length === 0 ? 'pass' : 'warn',
      detail: availableUpdates.length === 0 ? 'Up to date' : `${availableUpdates.length} update${availableUpdates.length !== 1 ? 's' : ''} available`,
      action: { label: 'View Updates', path: '/admin' },
    });

    // INGRESS
    const hasCustomCert = !!(ingress?.spec?.componentRoutes?.some((r: any) => r.servingCertKeyPairSecret) || ingress?.spec?.defaultCertificate);
    results.push({
      id: 'ingress-cert', category: 'Security',
      title: 'Custom Ingress Certificate',
      description: 'Replace self-signed default certificate with a trusted CA certificate',
      status: hasCustomCert ? 'pass' : 'warn',
      detail: hasCustomCert ? 'Custom certificate configured' : 'Using default self-signed certificate',
      action: { label: 'Configure Ingress', path: '/admin' },
    });

    return results;
  }, [nodes, clusterVersion, oauth, apiServer, storageClasses, netpols, quotas, healthChecks, clusterAutoscaler, kubeadminSecret, monitoringPods, logForwarder, ingress]);

  // Summary
  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const score = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 0;

  // Group by category
  const categories = React.useMemo(() => {
    const map = new Map<string, Check[]>();
    for (const check of checks) {
      if (!map.has(check.category)) map.set(check.category, []);
      map.get(check.category)!.push(check);
    }
    return [...map.entries()];
  }, [checks]);

  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const scoreBg = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-center gap-6">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1e293b" strokeWidth="3" />
            <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${score}, 100`} className={scoreColor} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-lg font-bold', scoreColor)}>{score}%</span>
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-100">Production Readiness</div>
          <div className="text-sm text-slate-400 mt-1">
            <span className="text-green-400">{passCount} passed</span>
            {warnCount > 0 && <span className="text-yellow-400 ml-3">{warnCount} warnings</span>}
            {failCount > 0 && <span className="text-red-400 ml-3">{failCount} failed</span>}
          </div>
          <div className="text-xs text-slate-500 mt-1">{checks.length} checks across {categories.length} categories</div>
        </div>
      </div>

      {/* Checks by category */}
      {categories.map(([category, categoryChecks]) => {
        const catPass = categoryChecks.filter(c => c.status === 'pass').length;
        return (
          <div key={category} className="bg-slate-900 rounded-lg border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{category}</h3>
              <span className={cn('text-xs', catPass === categoryChecks.length ? 'text-green-400' : 'text-slate-500')}>{catPass}/{categoryChecks.length}</span>
            </div>
            <div className="divide-y divide-slate-800">
              {categoryChecks.map((check) => (
                <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                  {check.status === 'pass' && <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
                  {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                  {check.status === 'warn' && <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />}
                  {check.status === 'loading' && <Loader2 className="w-5 h-5 text-slate-500 shrink-0 mt-0.5 animate-spin" />}
                  {check.status === 'unknown' && <AlertTriangle className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200">{check.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{check.description}</div>
                    {check.detail && (
                      <div className={cn('text-xs mt-1', check.status === 'pass' ? 'text-green-400' : check.status === 'fail' ? 'text-red-400' : 'text-yellow-400')}>
                        {check.detail}
                      </div>
                    )}
                  </div>
                  {check.action && check.status !== 'pass' && (
                    <button onClick={() => go(check.action!.path, check.action!.label)} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0">
                      {check.action.label} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
