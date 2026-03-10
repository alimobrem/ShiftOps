import { useState, useEffect } from 'react';
import { Card, CardBody, Grid, GridItem, DescriptionList, DescriptionListGroup, DescriptionListTerm, DescriptionListDescription, Label, Title } from '@patternfly/react-core';
import { useParams } from 'react-router-dom';
import ResourceDetailPage from '@/components/ResourceDetailPage';
import StatusIndicator from '@/components/StatusIndicator';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

export default function NodeDetail() {
  const { name } = useParams();
  const [node, setNode] = useState<Record<string, unknown> | null>(null);
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}/api/v1/nodes/${name}`);
        if (res.ok) {
          const raw = await res.json() as Record<string, unknown>;
          setNode(raw);
          setYaml(JSON.stringify(raw, null, 2));
        }
      } catch {
        // API may not be available
      }
      setLoading(false);
    }
    load();
  }, [name]);

  if (loading) return <div className="os-text-muted" role="status">Loading...</div>;
  if (!node) return <div className="os-text-muted">Node not found</div>;

  const meta = node['metadata'] as Record<string, unknown>;
  const status = node['status'] as Record<string, unknown>;
  const nodeInfo = (status?.['nodeInfo'] ?? {}) as Record<string, unknown>;
  const conditions = ((status?.['conditions'] ?? []) as Record<string, unknown>[]);
  const capacity = (status?.['capacity'] ?? {}) as Record<string, string>;
  const allocatable = (status?.['allocatable'] ?? {}) as Record<string, string>;
  const labels = (meta?.['labels'] ?? {}) as Record<string, string>;
  const addresses = ((status?.['addresses'] ?? []) as Record<string, string>[]);
  const readyCond = conditions.find((c) => c['type'] === 'Ready');
  const nodeStatus = readyCond?.['status'] === 'True' ? 'Ready' : 'NotReady';
  const roles = Object.keys(labels).filter((l) => l.startsWith('node-role.kubernetes.io/')).map((l) => l.replace('node-role.kubernetes.io/', '')).join(', ') || 'worker';
  const internalIP = addresses.find((a) => a['type'] === 'InternalIP')?.['address'] ?? '-';
  const hostname = addresses.find((a) => a['type'] === 'Hostname')?.['address'] ?? '-';

  const detailsTab = (
    <Grid hasGutter>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Node Information</Title>
            <DescriptionList>
              <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription><strong>{String(meta?.['name'] ?? '')}</strong></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Status</DescriptionListTerm><DescriptionListDescription><StatusIndicator status={nodeStatus} /></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Role</DescriptionListTerm><DescriptionListDescription><Label color="blue">{roles}</Label></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Kubelet Version</DescriptionListTerm><DescriptionListDescription><code>{String(nodeInfo['kubeletVersion'] ?? '-')}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>OS Image</DescriptionListTerm><DescriptionListDescription>{String(nodeInfo['osImage'] ?? '-')}</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Container Runtime</DescriptionListTerm><DescriptionListDescription><code>{String(nodeInfo['containerRuntimeVersion'] ?? '-')}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Internal IP</DescriptionListTerm><DescriptionListDescription><code>{internalIP}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Hostname</DescriptionListTerm><DescriptionListDescription>{hostname}</DescriptionListDescription></DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      </GridItem>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Capacity</Title>
            <DescriptionList>
              <DescriptionListGroup><DescriptionListTerm>CPU</DescriptionListTerm><DescriptionListDescription>{capacity['cpu'] ?? '-'} (allocatable: {allocatable['cpu'] ?? '-'})</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Memory</DescriptionListTerm><DescriptionListDescription>{capacity['memory'] ?? '-'} (allocatable: {allocatable['memory'] ?? '-'})</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Pods</DescriptionListTerm><DescriptionListDescription>{capacity['pods'] ?? '-'} (allocatable: {allocatable['pods'] ?? '-'})</DescriptionListDescription></DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Conditions</Title>
            {conditions.map((c) => (
              <div key={String(c['type'])} className="os-node__condition">
                <div className="os-node__condition-header">
                  <strong>{String(c['type'] ?? '')}</strong>
                  <StatusIndicator status={String(c['status'] ?? '')} />
                </div>
                <div className="os-node__condition-message">{String(c['message'] ?? '')}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  );

  return (
    <ResourceDetailPage
      kind="Node"
      name={String(meta?.['name'] ?? '')}
      status={nodeStatus}
      statusExtra={<Label color="blue">{roles}</Label>}
      backPath="/compute/nodes"
      backLabel="Nodes"
      yaml={yaml}
      tabs={[{ title: 'Details', content: detailsTab }]}
    />
  );
}
