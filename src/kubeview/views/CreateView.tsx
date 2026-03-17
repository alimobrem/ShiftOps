import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Plus, Package, Network, Globe, HardDrive, FileText,
  Lock, Shield, Clock, TrendingUp, Folder, User, ShieldCheck,
  Clipboard, AlertCircle, Box, Search, Loader2, ExternalLink,
  Ship, Image, GitBranch, Upload,
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useClusterStore } from '../store/clusterStore';
import { buildApiPath } from '../hooks/useResourceUrl';
import { useNavigateTab } from '../hooks/useNavigateTab';
import YamlEditor from '../components/yaml/YamlEditor';
import { snippets, resolveSnippet, getSnippetSuggestions, type Snippet } from '../components/yaml/SnippetEngine';
import { K8S_BASE as BASE } from '../engine/gvr';
import DeployProgress from '../components/DeployProgress';

interface CreateViewProps {
  gvrKey: string;
}

type CreateTab = 'deploy' | 'helm' | 'templates' | 'yaml';

// ===== Template categories (existing) =====
const templateCategories = [
  {
    title: 'Workloads',
    items: [
      { prefix: 'deploy', icon: Package, color: 'text-blue-400', gvr: 'apps/v1/deployments' },
      { prefix: 'cj', icon: Clock, color: 'text-cyan-400', gvr: 'batch/v1/cronjobs' },
    ],
  },
  {
    title: 'Networking',
    items: [
      { prefix: 'svc', icon: Network, color: 'text-green-400', gvr: 'v1/services' },
      { prefix: 'ing', icon: Globe, color: 'text-purple-400', gvr: 'networking.k8s.io/v1/ingresses' },
      { prefix: 'np', icon: ShieldCheck, color: 'text-red-400', gvr: 'networking.k8s.io/v1/networkpolicies' },
    ],
  },
  {
    title: 'Config & Storage',
    items: [
      { prefix: 'cm', icon: FileText, color: 'text-yellow-400', gvr: 'v1/configmaps' },
      { prefix: 'secret', icon: Lock, color: 'text-red-400', gvr: 'v1/secrets' },
      { prefix: 'pvc', icon: HardDrive, color: 'text-orange-400', gvr: 'v1/persistentvolumeclaims' },
    ],
  },
  {
    title: 'Access Control',
    items: [
      { prefix: 'ns', icon: Folder, color: 'text-amber-400', gvr: 'v1/namespaces' },
      { prefix: 'sa', icon: User, color: 'text-teal-400', gvr: 'v1/serviceaccounts' },
      { prefix: 'rb', icon: Shield, color: 'text-indigo-400', gvr: 'rbac.authorization.k8s.io/v1/rolebindings' },
      { prefix: 'hpa', icon: TrendingUp, color: 'text-pink-400', gvr: 'autoscaling/v2/horizontalpodautoscalers' },
    ],
  },
];

export default function CreateView({ gvrKey }: CreateViewProps) {
  const go = useNavigateTab();
  const addToast = useUIStore((s) => s.addToast);
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const registry = useClusterStore((s) => s.resourceRegistry);

  const [activeTab, setActiveTab] = useState<CreateTab>('deploy');
  const [editMode, setEditMode] = useState(false);
  const [activeGvr, setActiveGvr] = useState(gvrKey);
  const [yaml, setYaml] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gvrParts = activeGvr.split('/');
  const resourcePlural = gvrParts[gvrParts.length - 1];
  const resourceType = registry?.get(activeGvr) ?? (activeGvr.split('/').length === 2 ? registry?.get(`core/${activeGvr}`) : undefined);
  const kind = resourceType?.kind || resourcePlural.replace(/s$/, '').replace(/^./, (c) => c.toUpperCase());

  // If we came with a specific GVR (not the default), go straight to YAML editor
  useMemo(() => {
    if (gvrKey !== 'v1/pods') {
      const shortName = resourcePlural.replace(/s$/, '').toLowerCase();
      const snips = getSnippetSuggestions(shortName);
      if (snips.length > 0) {
        const resolved = resolveSnippet(snips[0]);
        const ns = selectedNamespace !== '*' ? selectedNamespace : 'default';
        setYaml(resolved.replace(/namespace: default/, `namespace: ${ns}`));
      } else {
        selectBlankYaml(gvrKey);
      }
      setEditMode(true);
      setActiveTab('yaml');
    }
  }, []);

  function selectTemplate(snippet: Snippet, gvr: string) {
    const resolved = resolveSnippet(snippet);
    const ns = selectedNamespace !== '*' ? selectedNamespace : 'default';
    setYaml(resolved.replace(/namespace: default/, `namespace: ${ns}`));
    setActiveGvr(gvr);
    setEditMode(true);
    setError(null);
  }

  function selectBlankYaml(gvr: string) {
    const parts = gvr.split('/');
    const group = parts.length === 3 ? parts[0] : '';
    const version = parts.length === 3 ? parts[1] : parts[0];
    const plural = parts[parts.length - 1];
    const apiVersion = group ? `${group}/${version}` : version;
    const shortName = plural.replace(/s$/, '');
    const kindName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
    const ns = selectedNamespace !== '*' ? selectedNamespace : 'default';
    const rt = registry?.get(gvr) ?? (parts.length === 2 ? registry?.get(`core/${gvr}`) : undefined);

    setYaml([
      `apiVersion: ${apiVersion}`,
      `kind: ${kindName}`,
      'metadata:',
      `  name: my-${shortName}`,
      rt?.namespaced !== false ? `  namespace: ${ns}` : null,
      'spec: {}',
    ].filter(Boolean).join('\n'));
    setActiveGvr(gvr);
    setEditMode(true);
    setError(null);
  }

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const nsMatch = yaml.match(/namespace:\s*(\S+)/);
      const ns = nsMatch?.[1] || (resourceType?.namespaced ? (selectedNamespace !== '*' ? selectedNamespace : 'default') : undefined);
      const apiPath = buildApiPath(activeGvr, ns);

      const res = await fetch(`${BASE}${apiPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/yaml' },
        body: yaml,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(body.message || `${res.status}: ${res.statusText}`);
      }

      const created = await res.json();
      const createdName = created.metadata?.name || 'resource';
      const createdNs = created.metadata?.namespace;

      addToast({ type: 'success', title: `${kind} "${createdName}" created` });

      const gvrUrl = activeGvr.replace(/\//g, '~');
      const detailPath = createdNs ? `/r/${gvrUrl}/${createdNs}/${createdName}` : `/r/${gvrUrl}/_/${createdName}`;
      go(detailPath, createdName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addToast({ type: 'error', title: 'Failed to create resource', detail: msg });
    } finally {
      setCreating(false);
    }
  }, [yaml, activeGvr, kind, creating, selectedNamespace, resourceType, addToast, go]);

  // YAML edit mode — full screen editor
  if (editMode) {
    return (
      <div className="flex flex-col h-full bg-slate-950">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setEditMode(false)} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"><ArrowLeft size={16} /></button>
            <span className="text-sm font-medium text-slate-200">Create {kind}</span>
            <span className="text-xs text-slate-500">{gvrParts.length === 3 ? `${gvrParts[0]}/${gvrParts[1]}` : gvrParts[0]}</span>
          </div>
          <button onClick={handleCreate} disabled={creating || !yaml.trim()} className={cn('flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-medium transition-colors', creating || !yaml.trim() ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white')}>
            <Plus size={12} /> {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 px-4 py-2 bg-red-950/50 border-b border-red-900 text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-red-300 text-xs flex-1">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-xs">Dismiss</button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <YamlEditor value={yaml} onChange={setYaml} onSave={handleCreate} height="100%" />
        </div>
      </div>
    );
  }

  // Picker mode
  const tabs: Array<{ id: CreateTab; label: string; icon: React.ReactNode }> = [
    { id: 'deploy', label: 'Quick Deploy', icon: <Box className="w-3.5 h-3.5" /> },
    { id: 'helm', label: 'Helm Charts', icon: <Ship className="w-3.5 h-3.5" /> },
    { id: 'templates', label: 'Templates', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'yaml', label: 'Import YAML', icon: <Upload className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Plus className="w-6 h-6 text-blue-500" />
            Create
          </h1>
          <p className="text-sm text-slate-400 mt-1">Deploy an application, install a Helm chart, or create a resource from YAML</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap', activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {activeTab === 'deploy' && <QuickDeployTab />}
        {activeTab === 'helm' && <HelmTab />}
        {activeTab === 'templates' && (
          <TemplatesTab
            onSelectTemplate={selectTemplate}
            onSelectBlank={selectBlankYaml}
          />
        )}
        {activeTab === 'yaml' && (
          <ImportYamlTab
            onImport={(text) => { setYaml(text); setActiveGvr('v1/pods'); setEditMode(true); }}
          />
        )}
      </div>
    </div>
  );
}

// ===== Quick Deploy =====
function QuickDeployTab() {
  const addToast = useUIStore((s) => s.addToast);
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [port, setPort] = useState('');
  const [replicas, setReplicas] = useState('1');
  const [createRoute, setCreateRoute] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployedApp, setDeployedApp] = useState<{ name: string; ns: string } | null>(null);

  const ns = selectedNamespace !== '*' ? selectedNamespace : 'default';

  const handleDeploy = async () => {
    if (!name.trim() || !image.trim()) {
      addToast({ type: 'error', title: 'Name and image are required' });
      return;
    }
    setDeploying(true);
    try {
      // Create Deployment
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: name.trim(), namespace: ns, labels: { app: name.trim() } },
        spec: {
          replicas: parseInt(replicas) || 1,
          selector: { matchLabels: { app: name.trim() } },
          template: {
            metadata: { labels: { app: name.trim() } },
            spec: {
              containers: [{
                name: name.trim(),
                image: image.trim(),
                ...(port ? { ports: [{ containerPort: parseInt(port) }] } : {}),
              }],
            },
          },
        },
      };

      const depRes = await fetch(`${BASE}/apis/apps/v1/namespaces/${ns}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployment),
      });
      if (!depRes.ok) {
        const err = await depRes.json().catch(() => ({ message: depRes.statusText }));
        throw new Error(err.message);
      }

      // Create Service if port specified
      if (port) {
        const service = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: name.trim(), namespace: ns, labels: { app: name.trim() } },
          spec: {
            selector: { app: name.trim() },
            ports: [{ port: parseInt(port), targetPort: parseInt(port), protocol: 'TCP' }],
          },
        };
        await fetch(`${BASE}/api/v1/namespaces/${ns}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(service),
        });

        // Create Route if requested (OpenShift)
        if (createRoute) {
          const route = {
            apiVersion: 'route.openshift.io/v1',
            kind: 'Route',
            metadata: { name: name.trim(), namespace: ns, labels: { app: name.trim() } },
            spec: {
              to: { kind: 'Service', name: name.trim() },
              port: { targetPort: parseInt(port) },
              tls: { termination: 'edge' },
            },
          };
          await fetch(`${BASE}/apis/route.openshift.io/v1/namespaces/${ns}/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(route),
          }).catch(() => {}); // Route creation is best-effort
        }
      }

      addToast({ type: 'success', title: `Application "${name}" created`, detail: `Watching rollout in ${ns}` });
      setDeployedApp({ name: name.trim(), ns });
    } catch (err) {
      addToast({ type: 'error', title: 'Deploy failed', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
    setDeploying(false);
  };

  return (
    <div className="space-y-6">
      {/* Deploy progress */}
      {deployedApp && (
        <DeployProgress
          type="deployment"
          name={deployedApp.name}
          namespace={deployedApp.ns}
          onClose={() => setDeployedApp(null)}
        />
      )}

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Image className="w-4 h-4 text-blue-400" />
          Deploy from Container Image
        </h2>
        <p className="text-xs text-slate-500">Creates a Deployment, Service, and Route for your application</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Application Name" required value={name} onChange={setName} placeholder="my-app" />
          <FormField label="Container Image" required value={image} onChange={setImage} placeholder="nginx:latest or quay.io/org/image:tag" />
          <FormField label="Container Port" value={port} onChange={setPort} placeholder="8080 (optional — creates Service)" type="number" />
          <FormField label="Replicas" value={replicas} onChange={setReplicas} placeholder="1" type="number" />
        </div>

        {port && (
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={createRoute} onChange={(e) => setCreateRoute(e.target.checked)} className="rounded" />
            Create Route (expose externally via HTTPS)
          </label>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleDeploy} disabled={deploying || !name.trim() || !image.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
            {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
          <span className="text-xs text-slate-500">Namespace: <span className="text-slate-300">{ns}</span></span>
        </div>
      </div>

      {/* Quick examples */}
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Examples</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: 'nginx', image: 'nginxinc/nginx-unprivileged:latest', port: '8080', desc: 'Nginx web server (non-root)' },
            { name: 'httpd', image: 'registry.access.redhat.com/ubi9/httpd-24:latest', port: '8080', desc: 'Apache HTTP server (UBI)' },
            { name: 'redis', image: 'registry.access.redhat.com/rhel9/redis-7:latest', port: '6379', desc: 'Redis in-memory store (UBI)' },
          ].map((ex) => (
            <button key={ex.name} onClick={() => { setName(ex.name); setImage(ex.image); setPort(ex.port); }}
              className="flex items-start gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-600 transition-colors text-left">
              <Package className="w-4 h-4 text-blue-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-slate-200">{ex.name}</div>
                <div className="text-xs text-slate-500">{ex.desc}</div>
                <div className="text-xs text-slate-600 font-mono mt-1">{ex.image}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Helm Charts =====
interface HelmChart {
  name: string;
  version: string;
  appVersion: string;
  description: string;
  icon?: string;
}

function HelmTab() {
  const addToast = useUIStore((s) => s.addToast);
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [releaseName, setReleaseName] = useState('');
  const [selectedChart, setSelectedChart] = useState<HelmChart | null>(null);
  const [installedJob, setInstalledJob] = useState<{ name: string; ns: string } | null>(null);

  const ns = selectedNamespace !== '*' ? selectedNamespace : 'default';

  // Fetch Helm releases (secrets with owner=helm)
  const { data: helmReleases = [] } = useQuery({
    queryKey: ['helm', 'releases', ns],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/namespaces/${ns}/secrets?labelSelector=owner%3Dhelm`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((s: any) => {
        const name = s.metadata.labels?.['name'] || s.metadata.name;
        const version = s.metadata.labels?.['version'] || '1';
        return { name, version, status: s.metadata.labels?.['status'] || 'unknown' };
      }).filter((r: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.name === r.name) === i);
    },
    refetchInterval: 30000,
  });

  // Popular charts (static catalog — real Helm catalog would require a backend)
  const chartCatalog: HelmChart[] = useMemo(() => [
    { name: 'postgresql', version: '16.4.3', appVersion: '17.4', description: 'PostgreSQL with replication and high availability' },
    { name: 'redis', version: '20.8.0', appVersion: '7.4', description: 'Redis in-memory data store with sentinel support' },
    { name: 'mysql', version: '12.3.0', appVersion: '8.4', description: 'MySQL database with primary-secondary replication' },
    { name: 'mongodb', version: '16.6.0', appVersion: '8.0', description: 'MongoDB NoSQL document database' },
    { name: 'nginx', version: '19.0.0', appVersion: '1.27', description: 'NGINX web server and reverse proxy' },
    { name: 'kafka', version: '31.3.0', appVersion: '3.9', description: 'Apache Kafka distributed event streaming' },
    { name: 'rabbitmq', version: '15.4.0', appVersion: '4.1', description: 'RabbitMQ open-source message broker' },
    { name: 'elasticsearch', version: '22.0.0', appVersion: '8.17', description: 'Elasticsearch distributed search and analytics' },
    { name: 'grafana', version: '8.12.0', appVersion: '11.5', description: 'Grafana observability dashboards' },
    { name: 'prometheus', version: '26.2.0', appVersion: '3.2', description: 'Prometheus monitoring and alerting' },
    { name: 'keycloak', version: '24.4.0', appVersion: '26.1', description: 'Keycloak identity and access management' },
    { name: 'minio', version: '14.10.0', appVersion: '2025', description: 'MinIO S3-compatible object storage' },
  ], []);

  const filteredCharts = search
    ? chartCatalog.filter(c => c.name.includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()))
    : chartCatalog;

  const handleInstall = async () => {
    if (!selectedChart || !releaseName.trim()) return;
    setInstalling(selectedChart.name);
    try {
      // Install via creating a Job that runs `helm install`
      // In a real setup, this would use a Helm operator or backend API
      const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: `helm-install-${releaseName.trim()}`,
          namespace: ns,
          labels: { app: 'helm-install', chart: selectedChart.name },
        },
        spec: {
          backoffLimit: 0,
          template: {
            spec: {
              restartPolicy: 'Never',
              serviceAccountName: 'default',
              containers: [{
                name: 'helm',
                image: 'alpine/helm:latest',
                command: ['helm', 'install', releaseName.trim(), `oci://registry-1.docker.io/bitnamicharts/${selectedChart.name}`, '--namespace', ns, '--wait', '--timeout', '5m'],
              }],
            },
          },
        },
      };

      const res = await fetch(`${BASE}/apis/batch/v1/namespaces/${ns}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message);
      }

      addToast({ type: 'success', title: `Helm install started`, detail: `${selectedChart.name} as "${releaseName}" in ${ns}` });
      setInstalledJob({ name: `helm-install-${releaseName.trim()}`, ns });
      setSelectedChart(null);
      setReleaseName('');
    } catch (err) {
      addToast({ type: 'error', title: 'Helm install failed', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
    setInstalling(null);
  };

  return (
    <div className="space-y-6">
      {/* Install progress */}
      {installedJob && (
        <DeployProgress
          type="job"
          name={installedJob.name}
          namespace={installedJob.ns}
          onClose={() => setInstalledJob(null)}
        />
      )}

      {/* Installed releases */}
      {helmReleases.length > 0 && (
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Ship className="w-4 h-4 text-blue-400" />
            Installed Releases ({helmReleases.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {helmReleases.map((r: any, i: number) => (
              <span key={i} className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded border border-slate-700 flex items-center gap-2">
                <Ship className="w-3 h-3 text-blue-400" />
                {r.name}
                <span className="text-slate-500">v{r.version}</span>
                <span className={cn('text-[10px] px-1 py-0.5 rounded', r.status === 'deployed' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300')}>{r.status}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search charts..." className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Install dialog */}
      {selectedChart && (
        <div className="bg-blue-950/30 rounded-lg border border-blue-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-200">Install {selectedChart.name}</h3>
          <p className="text-xs text-slate-400">{selectedChart.description}</p>
          <FormField label="Release Name" required value={releaseName} onChange={setReleaseName} placeholder={`my-${selectedChart.name}`} />
          <div className="flex items-center gap-2">
            <button onClick={handleInstall} disabled={!!installing || !releaseName.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ship className="w-4 h-4" />}
              {installing ? 'Installing...' : 'Install'}
            </button>
            <button onClick={() => setSelectedChart(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <span className="text-xs text-slate-500">Namespace: <span className="text-slate-300">{ns}</span></span>
          </div>
        </div>
      )}

      {/* Chart catalog */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredCharts.map((chart) => (
          <button key={chart.name} onClick={() => { setSelectedChart(chart); setReleaseName(`my-${chart.name}`); }}
            className="flex items-start gap-3 p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-blue-600 transition-colors text-left">
            <Ship className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{chart.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">{chart.version}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-2">{chart.description}</div>
              {chart.appVersion && <div className="text-[10px] text-slate-600 mt-1">App: v{chart.appVersion}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== Templates =====
function TemplatesTab({ onSelectTemplate, onSelectBlank }: {
  onSelectTemplate: (snippet: Snippet, gvr: string) => void;
  onSelectBlank: (gvr: string) => void;
}) {
  return (
    <div className="space-y-6">
      {templateCategories.map((cat) => (
        <div key={cat.title}>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">{cat.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cat.items.map((item) => {
              const snippet = snippets.find((s) => s.prefix === item.prefix);
              if (!snippet) return null;
              const Icon = item.icon;
              return (
                <button key={item.prefix} onClick={() => onSelectTemplate(snippet, item.gvr)}
                  className="flex flex-col items-start gap-2 p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-600 transition-colors text-left">
                  <Icon className={cn('w-5 h-5', item.color)} />
                  <div>
                    <div className="text-sm font-medium text-slate-200">{snippet.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{snippet.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Or start from scratch</h2>
        <button onClick={() => onSelectBlank('v1/pods')}
          className="flex items-center gap-3 p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-600 transition-colors">
          <FileText className="w-5 h-5 text-slate-400" />
          <div className="text-left">
            <div className="text-sm font-medium text-slate-200">Blank YAML</div>
            <div className="text-xs text-slate-500">Start with an empty editor</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ===== Import YAML =====
function ImportYamlTab({ onImport }: { onImport: (yaml: string) => void }) {
  const [text, setText] = useState('');

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.includes('apiVersion:') || clip.includes('"apiVersion"')) {
        onImport(clip);
      } else {
        setText(clip);
      }
    } catch {}
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const content = await file.text();
      onImport(content);
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={handlePaste} className="flex items-center gap-3 p-6 bg-slate-900 rounded-lg border border-dashed border-slate-700 hover:border-blue-600 transition-colors text-left">
          <Clipboard className="w-6 h-6 text-blue-400" />
          <div>
            <div className="text-sm font-semibold text-slate-200">Paste from Clipboard</div>
            <div className="text-xs text-slate-500 mt-1">Paste a Kubernetes YAML or JSON resource</div>
          </div>
        </button>
        <button onClick={handleUpload} className="flex items-center gap-3 p-6 bg-slate-900 rounded-lg border border-dashed border-slate-700 hover:border-blue-600 transition-colors text-left">
          <Upload className="w-6 h-6 text-purple-400" />
          <div>
            <div className="text-sm font-semibold text-slate-200">Upload File</div>
            <div className="text-xs text-slate-500 mt-1">Upload a .yaml, .yml, or .json file</div>
          </div>
        </button>
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Or paste YAML here</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="apiVersion: v1&#10;kind: ConfigMap&#10;metadata:&#10;  name: my-config&#10;..." rows={12} className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {text.trim() && (
          <button onClick={() => onImport(text)} className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded">
            <Plus className="w-4 h-4" /> Open in Editor
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Shared =====
function FormField({ label, value, onChange, placeholder, required, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input type={type || 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
    </div>
  );
}
