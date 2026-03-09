import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PageSection,
  Title,
  Breadcrumb,
  BreadcrumbItem,
} from '@patternfly/react-core';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import StatusIndicator from '@/components/StatusIndicator';
import { ageFromTimestamp } from '@/hooks/useK8sResource';

const BASE = '/api/kubernetes';

interface CRInstance {
  name: string;
  namespace: string;
  status: string;
  created: string;
}

interface CRDInfo {
  group: string;
  version: string;
  plural: string;
  kind: string;
  scope: string;
}

const columns: ColumnDef<CRInstance>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Namespace', key: 'namespace', render: (r) => r.namespace || <span className="os-text-muted">-</span> },
  { title: 'Status', key: 'status', render: (r) => r.status ? <StatusIndicator status={r.status} /> : <span className="os-text-muted">-</span> },
  { title: 'Created', key: 'created' },
];

export default function CRDInstances() {
  const { name: crdName } = useParams();
  const navigate = useNavigate();
  const [crdInfo, setCrdInfo] = useState<CRDInfo | null>(null);
  const [instances, setInstances] = useState<CRInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch the CRD to get group/version/plural
        const crdRes = await fetch(`${BASE}/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${crdName}`);
        if (!crdRes.ok) { setLoading(false); return; }
        const crd = await crdRes.json() as Record<string, unknown>;
        const spec = crd['spec'] as Record<string, unknown>;
        const names = spec['names'] as Record<string, unknown>;
        const versions = (spec['versions'] as Record<string, unknown>[]) ?? [];
        const servedVersion = versions.find((v) => v['served'] === true);
        const info: CRDInfo = {
          group: String(spec['group'] ?? ''),
          version: String(servedVersion?.['name'] ?? versions[0]?.['name'] ?? 'v1'),
          plural: String(names['plural'] ?? ''),
          kind: String(names['kind'] ?? ''),
          scope: String(spec['scope'] ?? 'Namespaced'),
        };
        setCrdInfo(info);

        // Fetch all instances
        const apiPath = info.group
          ? `/apis/${info.group}/${info.version}/${info.plural}`
          : `/api/${info.version}/${info.plural}`;
        const instancesRes = await fetch(`${BASE}${apiPath}`);
        if (instancesRes.ok) {
          const data = await instancesRes.json() as { items: Record<string, unknown>[] };
          setInstances(
            (data.items ?? []).map((item) => {
              const meta = item['metadata'] as Record<string, unknown>;
              const status = item['status'] as Record<string, unknown> | undefined;
              // Try common status fields
              const statusValue = status?.['phase'] ?? status?.['state'] ?? status?.['conditions'] ? 'Active' : '';
              return {
                name: String(meta['name'] ?? ''),
                namespace: String(meta['namespace'] ?? ''),
                status: String(statusValue ?? ''),
                created: ageFromTimestamp(meta['creationTimestamp'] as string),
              };
            })
          );
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [crdName]);

  return (
    <>
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem to="#" onClick={() => navigate('/administration/crds')}>
            Custom Resource Definitions
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{crdName}</BreadcrumbItem>
        </Breadcrumb>
        <Title headingLevel="h1" size="2xl">
          {crdInfo?.kind ?? crdName} Instances
        </Title>
        <p className="os-list__description">
          {crdInfo ? `${crdInfo.group}/${crdInfo.version} - ${crdInfo.scope}` : 'Loading...'}
        </p>
      </PageSection>

      <PageSection>
        <ResourceListPage
          title={`${crdInfo?.kind ?? ''} Instances`}
          description={`All instances of ${crdName}`}
          columns={columns}
          data={instances}
          loading={loading}
          getRowKey={(r) => `${r.namespace}-${r.name}`}
          nameField="name"
          onRowClick={(item) => {
            if (!crdInfo) return;
            const path = item.namespace
              ? `/apis/${crdInfo.group}/${crdInfo.version}/namespaces/${item.namespace}/${crdInfo.plural}/${item.name}`
              : `/apis/${crdInfo.group}/${crdInfo.version}/${crdInfo.plural}/${item.name}`;
            navigate(`/administration/crds/${crdName}/instances/${item.namespace || '-'}/${item.name}`);
          }}
        />
      </PageSection>
    </>
  );
}
