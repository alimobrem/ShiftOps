import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardBody,
  Grid,
  GridItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Label,
  Title,
} from '@patternfly/react-core';
import ResourceDetailPage from '@/components/ResourceDetailPage';
import StatusIndicator from '@/components/StatusIndicator';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

export default function CRInstanceDetail() {
  const { name: crdName, namespace, instanceName } = useParams();
  const [resource, setResource] = useState<Record<string, unknown> | null>(null);
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch CRD to get API path
        const crdRes = await fetch(`${BASE}/apis/apiextensions.k8s.io/v1/customresourcedefinitions/${crdName}`);
        if (!crdRes.ok) { setLoading(false); return; }
        const crd = await crdRes.json() as Record<string, unknown>;
        const spec = crd['spec'] as Record<string, unknown>;
        const names = spec['names'] as Record<string, unknown>;
        const versions = (spec['versions'] as Record<string, unknown>[]) ?? [];
        const servedVersion = versions.find((v) => v['served'] === true);
        const group = String(spec['group'] ?? '');
        const version = String(servedVersion?.['name'] ?? versions[0]?.['name'] ?? 'v1');
        const plural = String(names['plural'] ?? '');

        // Fetch the instance
        const ns = namespace && namespace !== '-' ? namespace : null;
        const apiPath = ns
          ? `/apis/${group}/${version}/namespaces/${ns}/${plural}/${instanceName}`
          : `/apis/${group}/${version}/${plural}/${instanceName}`;
        const res = await fetch(`${BASE}${apiPath}`);
        if (res.ok) {
          const raw = await res.json() as Record<string, unknown>;
          setResource(raw);
          setYaml(JSON.stringify(raw, null, 2));
        }
      } catch {
        // API may not be available
      }
      setLoading(false);
    }
    load();
  }, [crdName, namespace, instanceName]);

  if (loading) return <div className="os-text-muted" role="status">Loading...</div>;
  if (!resource) return <div className="os-text-muted">Resource not found</div>;

  const meta = resource['metadata'] as Record<string, unknown>;
  const spec = resource['spec'] as Record<string, unknown> | undefined;
  const statusObj = resource['status'] as Record<string, unknown> | undefined;
  const labels = (meta?.['labels'] ?? {}) as Record<string, string>;
  const kind = String(resource['kind'] ?? crdName);
  const resName = String(meta?.['name'] ?? instanceName ?? '');
  const resNs = String(meta?.['namespace'] ?? '');

  // Extract flat spec/status fields for display
  const specEntries = spec ? Object.entries(spec).filter(([, v]) => v !== null && typeof v !== 'object') : [];
  const statusEntries = statusObj ? Object.entries(statusObj).filter(([, v]) => v !== null && typeof v !== 'object') : [];
  const statusPhase = statusObj?.['phase'] ?? statusObj?.['state'] ?? '';

  const detailsTab = (
    <Grid hasGutter>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">{kind} Details</Title>
            <DescriptionList isCompact>
              <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription><strong>{resName}</strong></DescriptionListDescription></DescriptionListGroup>
              {resNs && <DescriptionListGroup><DescriptionListTerm>Namespace</DescriptionListTerm><DescriptionListDescription>{resNs}</DescriptionListDescription></DescriptionListGroup>}
              {statusPhase && <DescriptionListGroup><DescriptionListTerm>Status</DescriptionListTerm><DescriptionListDescription><StatusIndicator status={String(statusPhase)} /></DescriptionListDescription></DescriptionListGroup>}
              <DescriptionListGroup><DescriptionListTerm>API Version</DescriptionListTerm><DescriptionListDescription><code>{String(resource['apiVersion'] ?? '')}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Created</DescriptionListTerm><DescriptionListDescription>{String(meta?.['creationTimestamp'] ?? '-')}</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>UID</DescriptionListTerm><DescriptionListDescription><code>{String(meta?.['uid'] ?? '-')}</code></DescriptionListDescription></DescriptionListGroup>
              {specEntries.map(([key, val]) => (
                <DescriptionListGroup key={key}><DescriptionListTerm>{key}</DescriptionListTerm><DescriptionListDescription>{String(val)}</DescriptionListDescription></DescriptionListGroup>
              ))}
            </DescriptionList>
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Labels</Title>
            <div className="os-detail__labels-wrap">
              {Object.keys(labels).length > 0 ? Object.entries(labels).map(([k, v]) => (
                <Label key={k} color="blue"><code className="os-detail__label-code">{k}={v}</code></Label>
              )) : <span className="os-text-muted">No labels</span>}
            </div>
          </CardBody>
        </Card>
      </GridItem>
      <GridItem md={6}>
        {statusEntries.length > 0 && (
          <Card>
            <CardBody>
              <Title headingLevel="h3" size="lg" className="os-detail__section-title">Status</Title>
              <DescriptionList isCompact>
                {statusEntries.map(([key, val]) => (
                  <DescriptionListGroup key={key}><DescriptionListTerm>{key}</DescriptionListTerm><DescriptionListDescription>{String(val)}</DescriptionListDescription></DescriptionListGroup>
                ))}
              </DescriptionList>
            </CardBody>
          </Card>
        )}
      </GridItem>
    </Grid>
  );

  return (
    <ResourceDetailPage
      kind={kind}
      name={resName}
      namespace={resNs || ""}
      status={statusPhase ? String(statusPhase) : ""}
      backPath={`/administration/crds/${crdName}/instances`}
      backLabel={`${kind} Instances`}
      yaml={yaml}
      tabs={[{ title: 'Details', content: detailsTab }]}
    />
  );
}
