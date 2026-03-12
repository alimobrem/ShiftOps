import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, DropdownList, DropdownItem, MenuToggle, Divider, Label } from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';
import ConfirmDialog from '@/components/ConfirmDialog';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

interface PodRow {
  name: string;
  namespace: string;
  status: string;
  restarts: number;
  node: string;
  age: string;
}

interface RawPod extends K8sMeta {
  status: { phase?: string; containerStatuses?: { restartCount: number }[] };
  spec: { nodeName?: string };
}

function PodActions({ pod, onDelete }: { pod: PodRow; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  const handleDelete = async () => {
    setDeleteOpen(false);
    try {
      const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(pod.namespace)}/pods/${encodeURIComponent(pod.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `Pod ${pod.name} deleted` });
      onDelete();
    } catch (err) {
      addToast({ type: 'error', title: 'Delete failed', description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleRestart = async () => {
    setMenuOpen(false);
    try {
      await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(pod.namespace)}/pods/${encodeURIComponent(pod.name)}`, { method: 'DELETE' });
      addToast({ type: 'info', title: `Restarting ${pod.name}` });
      onDelete();
    } catch (err) {
      addToast({ type: 'error', title: 'Restart failed', description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Dropdown
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} variant="plain" onClick={() => setMenuOpen(!menuOpen)} aria-label="Actions">
            <EllipsisVIcon />
          </MenuToggle>
        )}
        popperProps={{ position: 'right' }}
      >
        <DropdownList>
          <DropdownItem onClick={handleRestart}>Restart Pod</DropdownItem>
          <DropdownItem onClick={() => { setMenuOpen(false); navigate(`/workloads/pods/${pod.namespace}/${pod.name}?tab=logs`); }}>
            View Logs
          </DropdownItem>
          <Divider />
          <DropdownItem onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} className="os-pods__delete-action">
            Delete Pod
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Pod"
        description={`Are you sure you want to delete pod "${pod.name}" in namespace "${pod.namespace}"? This action cannot be undone.`}
      />
    </span>
  );
}

function PodQuickActions({ pod, onRestart }: { pod: PodRow; onRestart: () => void }) {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  return (
    <span className="os-pods__quick-actions" onClick={(e) => e.stopPropagation()}>
      <Button variant="link" size="sm" isInline onClick={() => navigate(`/workloads/pods/${pod.namespace}/${pod.name}?tab=logs`)}>
        Logs
      </Button>
      <Button variant="link" size="sm" isInline onClick={async () => {
        try {
          await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(pod.namespace)}/pods/${encodeURIComponent(pod.name)}`, { method: 'DELETE' });
          addToast({ type: 'info', title: `Restarting ${pod.name}` });
          onRestart();
        } catch { /* ignore */ }
      }}>
        Restart
      </Button>
    </span>
  );
}

export default function Pods() {
  const navigate = useNavigate();

  const { data, loading, refetch } = useK8sResource<RawPod, PodRow>(
    '/api/v1/pods',
    (item) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace ?? '',
      status: item.status.phase ?? 'Unknown',
      restarts: item.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) ?? 0,
      node: item.spec.nodeName ?? '-',
      age: ageFromTimestamp(item.metadata.creationTimestamp),
    }),
    15000,
  );

  const columns: ColumnDef<PodRow>[] = [
    { title: 'Name', key: 'name' },
    { title: 'Namespace', key: 'namespace' },
    { title: 'Status', key: 'status', render: (p) => (
      <Label color={p.status === 'Running' ? 'green' : p.status === 'Succeeded' ? 'blue' : p.status === 'Pending' ? 'orange' : 'red'}>
        {p.status}
      </Label>
    ), sortable: false },
    { title: 'Restarts', key: 'restarts' },
    { title: 'Node', key: 'node' },
    { title: 'Age', key: 'age' },
    { title: 'Quick Actions', key: 'quick', render: (p) => <PodQuickActions pod={p} onRestart={refetch} />, sortable: false },
    { title: '', key: 'actions', render: (p) => <PodActions pod={p} onDelete={refetch} />, sortable: false },
  ];

  return (
    <ResourceListPage
      title="Pods"
      description="View and manage pod instances across all namespaces"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(p) => `${p.namespace}-${p.name}`}
      onRowClick={(p) => navigate(`/workloads/pods/${p.namespace}/${p.name}`)}
      createLabel="Create Pod"
      createConfig={{
        apiVersion: 'v1', kind: 'Pod', apiBase: '/api/v1', plural: 'pods',
        extraFields: [{ name: 'image', label: 'Container Image', placeholder: 'nginx:latest', required: true }],
        buildBody: (f) => ({
          apiVersion: 'v1', kind: 'Pod',
          metadata: { name: f['name'], namespace: f['namespace'] || 'default', labels: { app: f['name'] } },
          spec: { containers: [{ name: f['name'], image: f['image'], ports: [{ containerPort: 80 }] }] },
        }),
      }}
      onCreated={refetch}
      statusField="status"
      nameField="name"
      filterFn={(p, s) => p.name.toLowerCase().includes(s.toLowerCase()) || p.namespace.toLowerCase().includes(s.toLowerCase())}
    />
  );
}
