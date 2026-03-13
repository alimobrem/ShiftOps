import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import {
  Label, Button, Tooltip,
  Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
} from '@patternfly/react-core';
import { ExclamationCircleIcon, TrashIcon } from '@patternfly/react-icons';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';

const BASE = '/api/kubernetes';

interface RawSecret extends K8sMeta {
  type: string;
  data?: Record<string, string>;
}

interface HelmRelease {
  name: string;
  namespace: string;
  chart: string;
  version: string;
  status: string;
  description: string;
  age: string;
  isHelm: boolean;
}

function decodeReleaseInfo(data: Record<string, string> | undefined): { status: string; description: string } {
  if (!data?.['release']) return { status: 'unknown', description: '' };
  try {
    const decoded = atob(data['release']);
    if (decoded.startsWith('{')) {
      const release = JSON.parse(decoded) as Record<string, unknown>;
      const info = (release['info'] ?? {}) as Record<string, unknown>;
      return {
        status: String(info['status'] ?? 'unknown'),
        description: String(info['description'] ?? ''),
      };
    }
  } catch { /* ignore decode errors */ }
  return { status: 'unknown', description: '' };
}

const statusColors: Record<string, 'green' | 'blue' | 'orange' | 'red' | 'grey'> = {
  deployed: 'green',
  superseded: 'blue',
  failed: 'red',
  'pending-install': 'orange',
  'pending-upgrade': 'orange',
  uninstalling: 'orange',
};

function UninstallButton({ release, onDone }: { release: HelmRelease; onDone: () => void }) {
  const addToast = useUIStore((s) => s.addToast);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const handleUninstall = useCallback(async () => {
    setUninstalling(true);
    const { name, namespace } = release;

    try {
      // Create a Job that runs helm uninstall
      const saName = `helm-installer-${name}`;
      const jobName = `helm-uninstall-${name}-${Date.now().toString(36).slice(-4)}`;

      // Ensure SA exists
      await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'v1', kind: 'ServiceAccount',
          metadata: { name: saName, namespace, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
        }),
      });

      // Ensure ClusterRoleBinding
      await fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRoleBinding',
          metadata: { name: `helm-installer-${name}-${namespace}`, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
          roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
          subjects: [{ kind: 'ServiceAccount', name: saName, namespace }],
        }),
      });

      // Create uninstall Job
      const res = await fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'batch/v1', kind: 'Job',
          metadata: {
            name: jobName, namespace,
            labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer', 'helm-release': name },
          },
          spec: {
            backoffLimit: 1,
            ttlSecondsAfterFinished: 120,
            template: {
              metadata: { labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
              spec: {
                serviceAccountName: saName,
                restartPolicy: 'Never',
                containers: [{
                  name: 'helm',
                  image: 'alpine/helm:3.16.3',
                  command: ['sh', '-c', `helm uninstall ${name} -n ${namespace} && echo "Uninstall complete"`],
                }],
              },
            },
          },
        }),
      });

      if (res.ok) {
        addToast({ type: 'success', title: `Uninstalling ${name}`, description: `Helm uninstall job created in ${namespace}. Resources will be removed shortly.` });

        // Poll for job completion then cleanup
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > 30) { clearInterval(poll); onDone(); return; }
          try {
            const jobRes = await fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${jobName}`);
            if (jobRes.ok) {
              const job = await jobRes.json() as Record<string, unknown>;
              const status = (job['status'] ?? {}) as Record<string, unknown>;
              if (Number(status['succeeded'] ?? 0) > 0) {
                clearInterval(poll);
                addToast({ type: 'success', title: `${name} uninstalled`, description: 'All release resources have been removed.' });
                // Cleanup SA, CRB, job
                await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts/${saName}`, { method: 'DELETE' }).catch(() => {});
                await fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/helm-installer-${name}-${namespace}`, { method: 'DELETE' }).catch(() => {});
                onDone();
              } else if (Number(status['failed'] ?? 0) > 0) {
                clearInterval(poll);
                addToast({ type: 'error', title: `Uninstall failed: ${name}`, description: 'Check job logs for details.' });
                onDone();
              }
            }
          } catch { /* ignore */ }
        }, 3000);
      } else {
        const errText = await res.text();
        addToast({ type: 'error', title: 'Uninstall failed', description: errText.slice(0, 200) });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Uninstall failed', description: err instanceof Error ? err.message : String(err) });
    }

    setUninstalling(false);
    setConfirmOpen(false);
  }, [release, addToast, onDone]);

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        icon={<TrashIcon />}
        onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
        isLoading={uninstalling}
      >
        Uninstall
      </Button>

      {confirmOpen && (
        <Modal variant={ModalVariant.small} isOpen onClose={() => setConfirmOpen(false)}>
          <ModalHeader title={`Uninstall ${release.name}?`} />
          <ModalBody>
            <p>This will run <code>helm uninstall {release.name}</code> in namespace <strong>{release.namespace}</strong>, removing all resources created by this release.</p>
            <p style={{ marginTop: 12, color: 'var(--os-text-muted)' }}>This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={handleUninstall} isLoading={uninstalling}>Uninstall</Button>
            <Button variant="link" onClick={() => setConfirmOpen(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

export default function HelmReleases() {
  const navigate = useNavigate();
  const { data, loading, refetch } = useK8sResource<RawSecret, HelmRelease>(
    '/api/v1/secrets',
    (item) => {
      const releaseInfo = decodeReleaseInfo(item.data);
      return {
        name: item.metadata.labels?.['name'] ?? item.metadata.name,
        namespace: item.metadata.namespace ?? '',
        chart: item.metadata.labels?.['name'] ?? '-',
        version: item.metadata.labels?.['version'] ?? '-',
        status: item.metadata.labels?.['status'] ?? releaseInfo.status,
        description: releaseInfo.description,
        age: ageFromTimestamp(item.metadata.creationTimestamp),
        isHelm: item.type === 'helm.sh/release.v1',
      };
    },
  );

  const columns: ColumnDef<HelmRelease>[] = [
    { title: 'Name', key: 'name' },
    { title: 'Namespace', key: 'namespace' },
    { title: 'Chart', key: 'chart' },
    { title: 'Version', key: 'version' },
    {
      title: 'Status', key: 'status',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Label color={statusColors[r.status] ?? 'grey'}>{r.status}</Label>
          {r.status === 'failed' && r.description && (
            <Tooltip content={r.description}>
              <ExclamationCircleIcon style={{ color: '#c9190b', cursor: 'help' }} />
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: 'Info', key: 'description',
      render: (r) => {
        if (!r.description) return '-';
        const text = r.description.length > 80 ? r.description.slice(0, 77) + '...' : r.description;
        return (
          <Tooltip content={r.description}>
            <span style={{ fontSize: 12, color: r.status === 'failed' ? '#c9190b' : 'var(--os-text-muted, #8a8d90)', cursor: 'default' }}>
              {text}
            </span>
          </Tooltip>
        );
      },
    },
    { title: 'Updated', key: 'age' },
    {
      title: '', key: 'actions', sortable: false,
      render: (r) => <UninstallButton release={r} onDone={refetch} />,
    },
  ];

  // Filter to only Helm releases, deduplicate keeping latest version
  const releaseMap = new Map<string, HelmRelease>();
  for (const r of data.filter((r) => r.isHelm)) {
    const key = `${r.namespace}/${r.name}`;
    const existing = releaseMap.get(key);
    if (!existing || Number(r.version) > Number(existing.version)) {
      releaseMap.set(key, r);
    }
  }
  const releases = Array.from(releaseMap.values());
  const failedCount = releases.filter((r) => r.status === 'failed').length;

  return (
    <ResourceListPage
      title="Helm Releases"
      description={`Helm releases installed in the cluster${failedCount > 0 ? ` — ${failedCount} failed` : ''}`}
      columns={columns}
      data={releases}
      loading={loading}
      getRowKey={(r) => `${r.namespace}-${r.name}-${r.version}`}
      nameField="name"
      statusField="status"
      toolbarExtra={<Button variant="primary" onClick={() => navigate('/helm/charts')}>Browse Charts</Button>}
    />
  );
}
