import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Label, Button } from '@patternfly/react-core';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';

interface RawNode extends K8sMeta {
  spec?: RawNodeSpec;
  status?: {
    conditions?: { type: string; status: string }[];
    nodeInfo?: { kubeletVersion?: string; osImage?: string; containerRuntimeVersion?: string };
    addresses?: { type: string; address: string }[];
    capacity?: Record<string, string>;
    allocatable?: Record<string, string>;
  };
}

interface RawNodeSpec {
  unschedulable?: boolean;
}

interface NodeRow {
  name: string;
  status: string;
  roles: string;
  version: string;
  internalIP: string;
  os: string;
  cpu: string;
  memory: string;
  age: string;
  schedulable: boolean;
}

const BASE = '/api/kubernetes';

function CordonButton({ node, onDone }: { node: NodeRow; onDone: () => void }) {
  const addToast = useUIStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const isCordoned = !node.schedulable;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/v1/nodes/${encodeURIComponent(node.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
        body: JSON.stringify({ spec: { unschedulable: !isCordoned ? true : null } }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `${node.name} ${isCordoned ? 'uncordoned' : 'cordoned'}` });
      onDone();
    } catch (err) {
      addToast({ type: 'error', title: 'Failed', description: err instanceof Error ? err.message : String(err) });
    }
    setLoading(false);
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button variant="link" size="sm" isInline isLoading={loading} onClick={handleToggle}>
        {isCordoned ? 'Uncordon' : 'Cordon'}
      </Button>
    </span>
  );
}

export default function Nodes() {
  const navigate = useNavigate();

  const { data, loading, refetch } = useK8sResource<RawNode, NodeRow>(
    '/api/v1/nodes',
    (item) => {
      const conditions = item.status?.conditions ?? [];
      const readyCond = conditions.find((c) => c.type === 'Ready');
      const status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';
      const labels = item.metadata.labels ?? {};
      const roles = Object.keys(labels)
        .filter((l) => l.startsWith('node-role.kubernetes.io/'))
        .map((l) => l.replace('node-role.kubernetes.io/', ''))
        .join(', ') || 'worker';
      const addresses = item.status?.addresses ?? [];
      const internalIP = addresses.find((a) => a.type === 'InternalIP')?.address ?? '-';
      const capacity = item.status?.capacity ?? {};
      const allocatable = item.status?.allocatable ?? {};
      return {
        name: item.metadata.name,
        status,
        roles,
        version: item.status?.nodeInfo?.kubeletVersion ?? '-',
        internalIP,
        os: item.status?.nodeInfo?.osImage ?? '-',
        cpu: `${allocatable['cpu'] ?? '-'} / ${capacity['cpu'] ?? '-'}`,
        memory: `${allocatable['memory'] ?? '-'} / ${capacity['memory'] ?? '-'}`,
        age: ageFromTimestamp(item.metadata.creationTimestamp),
        schedulable: !item.spec?.unschedulable,
      };
    },
    30000,
  );

  const columns: ColumnDef<NodeRow>[] = [
    { title: 'Name', key: 'name' },
    { title: 'Status', key: 'status', render: (n) => (
      <Label color={n.status === 'Ready' ? 'green' : 'red'}>{n.status}{!n.schedulable ? ', Cordoned' : ''}</Label>
    ), sortable: false },
    {
      title: 'Roles', key: 'roles', render: (n) => (
        <>{n.roles.split(', ').map((r) => <Label key={r} color="blue" className="pf-v5-u-mr-xs">{r}</Label>)}</>
      ), sortable: false,
    },
    { title: 'Version', key: 'version' },
    { title: 'CPU', key: 'cpu' },
    { title: 'Memory', key: 'memory' },
    { title: 'Age', key: 'age' },
    { title: 'Actions', key: 'actions', render: (n) => <CordonButton node={n} onDone={refetch} />, sortable: false },
  ];

  return (
    <ResourceListPage
      title="Nodes"
      description="View and manage cluster compute nodes"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(n) => n.name}
      onRowClick={(n) => navigate(`/compute/nodes/${n.name}`)}
      statusField="status"
      nameField="name"
    />
  );
}
