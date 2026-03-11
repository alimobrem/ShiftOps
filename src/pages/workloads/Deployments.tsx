import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Label } from '@patternfly/react-core';
import { MinusIcon, PlusIcon } from '@patternfly/react-icons';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import ResourceActions from '@/components/ResourceActions';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

interface DeployRow {
  name: string;
  namespace: string;
  status: string;
  replicas: number;
  ready: number;
  age: string;
}

interface RawDeployment extends K8sMeta {
  spec: { replicas?: number };
  status: { readyReplicas?: number; availableReplicas?: number; conditions?: { type: string; status: string }[] };
}

function ScaleInline({ deploy, onScaled }: { deploy: DeployRow; onScaled: () => void }) {
  const addToast = useUIStore((s) => s.addToast);
  const [scaling, setScaling] = useState(false);

  const handleScale = async (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = Math.max(0, deploy.replicas + delta);
    setScaling(true);
    try {
      const res = await fetch(`${BASE}/apis/apps/v1/namespaces/${encodeURIComponent(deploy.namespace)}/deployments/${encodeURIComponent(deploy.name)}/scale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'autoscaling/v1', kind: 'Scale',
          metadata: { name: deploy.name, namespace: deploy.namespace },
          spec: { replicas: next },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `Scaled ${deploy.name}`, description: `Replicas: ${next}` });
      onScaled();
    } catch (err) {
      addToast({ type: 'error', title: 'Scale failed', description: err instanceof Error ? err.message : String(err) });
    }
    setScaling(false);
  };

  return (
    <span className="os-deployments__scale-inline" onClick={(e) => e.stopPropagation()}>
      <Button variant="plain" size="sm" isDisabled={deploy.replicas <= 0 || scaling} onClick={(e) => handleScale(-1, e)} aria-label="Scale down" className="os-deployments__scale-btn">
        <MinusIcon />
      </Button>
      <span className="os-deployments__scale-value">{deploy.ready}/{deploy.replicas}</span>
      <Button variant="plain" size="sm" isDisabled={scaling} onClick={(e) => handleScale(1, e)} aria-label="Scale up" className="os-deployments__scale-btn">
        <PlusIcon />
      </Button>
    </span>
  );
}

export default function Deployments() {
  const navigate = useNavigate();

  const { data, loading, refetch } = useK8sResource<RawDeployment, DeployRow>(
    '/apis/apps/v1/deployments',
    (item) => {
      const conditions = item.status.conditions ?? [];
      const available = conditions.find((c) => c.type === 'Available');
      const status = available?.status === 'True' ? 'Running' : 'Pending';
      return {
        name: item.metadata.name,
        namespace: item.metadata.namespace ?? '',
        status,
        replicas: item.spec.replicas ?? 0,
        ready: item.status.readyReplicas ?? 0,
        age: ageFromTimestamp(item.metadata.creationTimestamp),
      };
    },
    15000,
  );

  const columns: ColumnDef<DeployRow>[] = [
    { title: 'Name', key: 'name' },
    { title: 'Namespace', key: 'namespace' },
    { title: 'Status', key: 'status', render: (d) => <Label color={d.status === 'Running' ? 'green' : 'orange'}>{d.status}</Label>, sortable: false },
    { title: 'Replicas', key: 'replicas', render: (d) => <ScaleInline deploy={d} onScaled={refetch} />, sortable: false },
    { title: 'Age', key: 'age' },
    { title: '', key: 'actions', render: (d) => <ResourceActions name={d.name} namespace={d.namespace} apiBase="/apis/apps/v1" resourceType="deployments" kind="Deployment" detailPath={`/workloads/deployments/${d.namespace}/${d.name}`} onDelete={refetch} />, sortable: false },
  ];

  return (
    <ResourceListPage
      title="Deployments"
      description="Manage deployment resources across your cluster"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(d) => `${d.namespace}-${d.name}`}
      onRowClick={(d) => navigate(`/workloads/deployments/${d.namespace}/${d.name}`)}
      createLabel="Create Deployment"
      statusField="status"
      nameField="name"
      filterFn={(d, s) => d.name.toLowerCase().includes(s.toLowerCase()) || d.namespace.toLowerCase().includes(s.toLowerCase())}
    />
  );
}
