import React from 'react';
import { Button, DropdownItem } from '@patternfly/react-core';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import ResourceActions from '@/components/ResourceActions';
import StatusIndicator from '@/components/StatusIndicator';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';

const BASE = '/api/kubernetes';

interface PipelineRun {
  name: string;
  namespace: string;
  pipeline: string;
  status: string;
  duration: string;
  age: string;
}

interface RawCondition {
  type: string;
  reason?: string;
}

interface RawPipelineRun extends K8sMeta {
  spec: {
    pipelineRef?: {
      name: string;
    };
  };
  status?: {
    conditions?: RawCondition[];
    startTime?: string;
    completionTime?: string;
  };
}

function computeDuration(startTime: string | undefined, completionTime: string | undefined): string {
  if (!startTime || !completionTime) return '-';
  const start = new Date(startTime).getTime();
  const end = new Date(completionTime).getTime();
  const diffMs = end - start;
  if (diffMs < 0) return '-';
  const totalSeconds = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function extractStatus(conditions: RawCondition[] | undefined): string {
  if (!conditions || conditions.length === 0) return 'Unknown';
  const first = conditions[0];
  return first!.reason ?? first!.type;
}

const columns: ColumnDef<PipelineRun>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Namespace', key: 'namespace' },
  { title: 'Pipeline', key: 'pipeline' },
  {
    title: 'Status',
    key: 'status',
    render: (item) => <StatusIndicator status={item.status} />,
  },
  { title: 'Duration', key: 'duration' },
  { title: 'Age', key: 'age' },
  { title: '', key: 'actions', render: (r) => <PipelineRunActions run={r} />, sortable: false },
];

function PipelineRunActions({ run }: { run: PipelineRun }) {
  const addToast = useUIStore((s) => s.addToast);

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${BASE}/apis/tekton.dev/v1/namespaces/${encodeURIComponent(run.namespace)}/pipelineruns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'tekton.dev/v1', kind: 'PipelineRun',
          metadata: { generateName: `${run.pipeline}-rerun-`, namespace: run.namespace },
          spec: { pipelineRef: { name: run.pipeline } },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `Re-run started for ${run.pipeline}` });
    } catch (err) {
      addToast({ type: 'error', title: 'Re-run failed', description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <ResourceActions
      name={run.name}
      namespace={run.namespace}
      apiBase="/apis/tekton.dev/v1"
      resourceType="pipelineruns"
      kind="PipelineRun"
      extraItems={
        <DropdownItem onClick={handleRerun}>Re-run Pipeline</DropdownItem>
      }
    />
  );
}

export default function PipelineRuns() {
  const { data, loading } = useK8sResource<RawPipelineRun, PipelineRun>(
    '/apis/tekton.dev/v1/pipelineruns',
    (item) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace ?? '',
      pipeline: item.spec.pipelineRef?.name ?? '-',
      status: extractStatus(item.status?.conditions),
      duration: computeDuration(item.status?.startTime, item.status?.completionTime),
      age: ageFromTimestamp(item.metadata.creationTimestamp),
    }),
  );

  return (
    <ResourceListPage
      title="PipelineRuns"
      description="Tekton PipelineRun instances represent individual executions of a Pipeline"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(p) => `${p.namespace}-${p.name}`}
      nameField="name"
      createLabel="Start PipelineRun"
      createConfig={{
        apiVersion: 'tekton.dev/v1', kind: 'PipelineRun', apiBase: '/apis/tekton.dev/v1', plural: 'pipelineruns',
        extraFields: [{ name: 'pipelineName', label: 'Pipeline Name', placeholder: 'my-pipeline', required: true }],
        buildBody: (f) => ({
          apiVersion: 'tekton.dev/v1', kind: 'PipelineRun',
          metadata: { generateName: `${f['pipelineName']}-run-`, namespace: f['namespace'] || 'default' },
          spec: { pipelineRef: { name: f['pipelineName'] } },
        }),
      }}
    />
  );
}
