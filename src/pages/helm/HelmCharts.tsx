import React, { useState } from 'react';
import {
  Button, Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
  FormGroup, TextInput, Label,
} from '@patternfly/react-core';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import ResourceActions from '@/components/ResourceActions';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';

interface RawHelmChartRepo extends K8sMeta {
  spec?: {
    connectionConfig?: {
      url?: string;
    };
  };
  status?: {
    conditions?: {
      type: string;
      status: string;
    }[];
  };
}

interface HelmRepo {
  name: string;
  url: string;
  status: string;
  age: string;
}

const statusColors: Record<string, 'green' | 'red' | 'grey'> = {
  True: 'green',
  False: 'red',
};

const columns: ColumnDef<HelmRepo>[] = [
  { title: 'Name', key: 'name' },
  { title: 'URL', key: 'url' },
  { title: 'Status', key: 'status', render: (r) => <Label color={statusColors[r.status] ?? 'grey'}>{r.status === 'True' ? 'Ready' : r.status === 'False' ? 'Error' : r.status}</Label> },
  { title: 'Age', key: 'age' },
  { title: '', key: 'actions', render: (r) => <ResourceActions name={r.name} apiBase="/apis/helm.openshift.io/v1beta1" resourceType="helmchartrepositories" kind="HelmChartRepository" />, sortable: false },
];

export default function HelmCharts() {
  const addToast = useUIStore((s) => s.addToast);
  const [addOpen, setAddOpen] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const { data, loading, error, refetch } = useK8sResource<RawHelmChartRepo, HelmRepo>(
    '/apis/helm.openshift.io/v1beta1/helmchartrepositories',
    (item) => {
      const readyCondition = item.status?.conditions?.find((c) => c.type === 'Ready');
      return {
        name: item.metadata.name,
        url: item.spec?.connectionConfig?.url ?? '-',
        status: readyCondition?.status ?? 'Unknown',
        age: ageFromTimestamp(item.metadata.creationTimestamp),
      };
    },
  );

  const handleAdd = async () => {
    if (!repoName || !repoUrl) return;
    setAdding(true);
    try {
      const res = await fetch('/api/kubernetes/apis/helm.openshift.io/v1beta1/helmchartrepositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'helm.openshift.io/v1beta1',
          kind: 'HelmChartRepository',
          metadata: { name: repoName },
          spec: { connectionConfig: { url: repoUrl } },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.slice(0, 200));
      }
      addToast({ type: 'success', title: 'Repository added', description: `${repoName} → ${repoUrl}` });
      setAddOpen(false);
      setRepoName('');
      setRepoUrl('');
      refetch();
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to add repository', description: err instanceof Error ? err.message : String(err) });
    }
    setAdding(false);
  };

  const is404 = error?.startsWith('404');
  const displayData = is404 ? [] : data;

  const addButton = (
    <Button variant="primary" onClick={() => setAddOpen(true)}>Add Repository</Button>
  );

  return (
    <>
      <ResourceListPage
        title="Helm Chart Repositories"
        description="Manage Helm chart repositories. Add a repo to browse and install charts from the catalog."
        columns={columns}
        data={displayData}
        loading={loading && !is404}
        getRowKey={(r) => r.name}
        nameField="name"
        toolbarExtra={addButton}
      />

      {addOpen && (
        <Modal variant={ModalVariant.small} isOpen onClose={() => setAddOpen(false)}>
          <ModalHeader title="Add Helm Chart Repository" />
          <ModalBody>
            <FormGroup label="Repository Name" isRequired fieldId="repo-name">
              <TextInput
                id="repo-name"
                value={repoName}
                onChange={(_e, val) => setRepoName(val.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="bitnami"
                isRequired
              />
            </FormGroup>
            <FormGroup label="Repository URL" isRequired fieldId="repo-url" style={{ marginTop: 12 }}>
              <TextInput
                id="repo-url"
                value={repoUrl}
                onChange={(_e, val) => setRepoUrl(val)}
                placeholder="https://charts.bitnami.com/bitnami"
                isRequired
              />
            </FormGroup>
            <div style={{ marginTop: 16, fontSize: 12 }} className="os-text-muted">
              This creates a cluster-scoped HelmChartRepository CR. Charts from this repo will appear in the Helm Chart Catalog.
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={handleAdd} isLoading={adding} isDisabled={!repoName || !repoUrl}>
              Add
            </Button>
            <Button variant="link" onClick={() => setAddOpen(false)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
