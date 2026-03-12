import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownList, DropdownItem, MenuToggle, Divider, Label } from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useClusterStore } from '@/store/useClusterStore';
import { useUIStore } from '@/store/useUIStore';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import '@/openshift-components.css';

interface NS {
  name: string;
  status: string;
  labels: string[];
  age: string;
  podCount: number;
}

const BASE = '/api/kubernetes';

interface RawNamespace extends K8sMeta {
  status: { phase?: string };
}

function NamespaceActions({ ns }: { ns: NS }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const deleteNamespace = useClusterStore((s) => s.deleteNamespace);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  const isProtected = ['default', 'kube-system', 'kube-public'].includes(ns.name);

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
          <DropdownItem onClick={() => {
            setMenuOpen(false);
            navigate(`/administration/namespaces/${ns.name}?tab=labels`);
          }}>
            Edit Labels
          </DropdownItem>
          <DropdownItem onClick={() => {
            setMenuOpen(false);
            navigate(`/administration/namespaces/${ns.name}?tab=annotations`);
          }}>
            Edit Annotations
          </DropdownItem>
          <Divider />
          <DropdownItem
            isDisabled={isProtected}
            onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
            {...(isProtected ? {} : { className: 'os-namespaces__delete-action' })}
          >
            Delete Namespace
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteNamespace(ns.name);
          addToast({ type: 'success', title: `Namespace ${ns.name} deleted` });
        }}
        title="Delete Namespace"
        description={`Are you sure you want to delete namespace "${ns.name}"? All resources in this namespace will be permanently deleted.`}
      />
    </span>
  );
}

const columns: ColumnDef<NS>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Status', key: 'status' },
  { title: 'Labels', key: 'labels', render: (ns) => (
    <span className="os-namespaces__labels-wrap">
      {ns.labels.map((l) => <Label key={l} color="blue"><code className="os-namespaces__label-code">{l}</code></Label>)}
    </span>
  ), sortable: false },
  { title: 'Workloads', key: 'podCount', render: (ns) => ns.podCount === 0 ? <Label color="orange">Unused</Label> : <span>{ns.podCount} pods</span>, sortable: false },
  { title: 'Age', key: 'age' },
  { title: '', key: 'actions', render: (ns) => <NamespaceActions ns={ns} />, sortable: false },
];

export default function Namespaces() {
  const navigate = useNavigate();
  const [podCounts, setPodCounts] = React.useState<Record<string, number>>({});

  const { data: rawData, loading } = useK8sResource<RawNamespace, NS>(
    '/api/v1/namespaces',
    (item) => ({
      name: item.metadata.name,
      status: item.status.phase ?? 'Active',
      labels: Object.entries(item.metadata.labels ?? {}).map(([k, v]) => `${k}=${v}`),
      age: ageFromTimestamp(item.metadata.creationTimestamp),
      podCount: 0,
    }),
  );

  React.useEffect(() => {
    async function loadPodCounts() {
      try {
        const res = await fetch(`${BASE}/api/v1/pods`);
        if (!res.ok) return;
        const json = await res.json() as { items?: { metadata: { namespace?: string } }[] };
        const counts: Record<string, number> = {};
        for (const pod of json.items ?? []) {
          const ns = pod.metadata.namespace ?? '';
          counts[ns] = (counts[ns] ?? 0) + 1;
        }
        setPodCounts(counts);
      } catch { /* ignore */ }
    }
    loadPodCounts();
  }, [rawData.length]);

  const data = rawData.map((ns) => ({ ...ns, podCount: podCounts[ns.name] ?? 0 }));

  return (
    <ResourceListPage
      title="Namespaces"
      description="Manage namespace isolation and organization"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(ns) => ns.name}
      createLabel="Create Namespace"
      statusField="status"
      nameField="name"
      onRowClick={(item) => navigate(`/administration/namespaces/${item.name}`)}
    />
  );
}
