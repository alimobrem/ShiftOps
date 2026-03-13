import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardBody, Grid, GridItem, DescriptionList, DescriptionListGroup, DescriptionListTerm, DescriptionListDescription, Label, Title, Progress, ProgressVariant } from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useParams } from 'react-router-dom';
import ResourceDetailPage from '@/components/ResourceDetailPage';
import StatusIndicator from '@/components/StatusIndicator';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

export default function DeploymentDetail() {
  const { namespace, name } = useParams();
  const [deploy, setDeploy] = useState<Record<string, unknown> | null>(null);
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [replicaSets, setReplicaSets] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}/apis/apps/v1/namespaces/${namespace}/deployments/${name}`);
        if (res.ok) {
          const raw = await res.json() as Record<string, unknown>;
          setDeploy(raw);
          setYaml(JSON.stringify(raw, null, 2));
        }
      } catch {
        // API may not be available
      }
      setLoading(false);
    }
    load();

    // Fetch ReplicaSets for rollout history
    async function loadRS() {
      try {
        const res = await fetch(`${BASE}/apis/apps/v1/namespaces/${namespace}/replicasets`);
        if (!res.ok) return;
        const json = await res.json() as { items: Record<string, unknown>[] };
        const owned = json.items.filter((rs) => {
          const owners = ((rs['metadata'] as Record<string, unknown>)?.['ownerReferences'] ?? []) as Record<string, unknown>[];
          return owners.some((o) => String(o['name']) === name && String(o['kind']) === 'Deployment');
        });
        setReplicaSets(owned);
      } catch { /* ignore */ }
    }
    loadRS();
  }, [namespace, name]);

  const rolloutHistory = useMemo(() => {
    try {
      const sorted = [...replicaSets].sort((a, b) => {
        const metaA = (a?.['metadata'] ?? {}) as Record<string, unknown>;
        const metaB = (b?.['metadata'] ?? {}) as Record<string, unknown>;
        const annA = (metaA['annotations'] ?? {}) as Record<string, string>;
        const annB = (metaB['annotations'] ?? {}) as Record<string, string>;
        return Number(annB['deployment.kubernetes.io/revision'] ?? 0) - Number(annA['deployment.kubernetes.io/revision'] ?? 0);
      });
      return sorted.map((rs) => {
        const rsMeta = (rs?.['metadata'] ?? {}) as Record<string, unknown>;
        const rsSpec = (rs?.['spec'] ?? {}) as Record<string, unknown>;
        const rsStatus = (rs?.['status'] ?? {}) as Record<string, unknown>;
        const annotations = (rsMeta['annotations'] ?? {}) as Record<string, string>;
        const template = rsSpec['template'] as Record<string, unknown> | undefined;
        const podSpec = template?.['spec'] as Record<string, unknown> | undefined;
        const containers = (podSpec?.['containers'] ?? []) as Record<string, unknown>[];
        return {
          revision: annotations['deployment.kubernetes.io/revision'] ?? '-',
          image: containers.length > 0 ? String(containers[0]['image'] ?? '-') : '-',
          replicas: Number(rsSpec['replicas'] ?? 0),
          ready: Number(rsStatus['readyReplicas'] ?? 0),
          created: String(rsMeta['creationTimestamp'] ?? '-'),
        };
      });
    } catch {
      return [];
    }
  }, [replicaSets]);

  if (loading) return <div className="os-text-muted" role="status">Loading...</div>;
  if (!deploy) return <div className="os-text-muted">Deployment not found. Check that the namespace and name are correct.</div>;

  const meta = deploy['metadata'] as Record<string, unknown>;
  const spec = deploy['spec'] as Record<string, unknown>;
  const status = deploy['status'] as Record<string, unknown>;
  const labels = (meta?.['labels'] ?? {}) as Record<string, string>;
  const strategy = (spec?.['strategy'] as Record<string, unknown>)?.['type'] as string ?? '-';
  const replicas = Number(spec?.['replicas'] ?? 0);
  const ready = Number(status?.['readyReplicas'] ?? 0);
  const available = Number(status?.['availableReplicas'] ?? 0);
  const conditions = ((status?.['conditions'] ?? []) as Record<string, unknown>[]);
  const statusText = available >= replicas ? 'Available' : 'Progressing';

  const detailsTab = (
    <Grid hasGutter>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Deployment Details</Title>
            <DescriptionList>
              <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription><strong>{String(meta?.['name'] ?? '')}</strong></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Namespace</DescriptionListTerm><DescriptionListDescription>{String(meta?.['namespace'] ?? '')}</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Strategy</DescriptionListTerm><DescriptionListDescription><Label color="blue">{strategy}</Label></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Selector</DescriptionListTerm><DescriptionListDescription><code>{JSON.stringify((spec?.['selector'] as Record<string, unknown>)?.['matchLabels'] ?? {})}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Created</DescriptionListTerm><DescriptionListDescription>{String(meta?.['creationTimestamp'] ?? '-')}</DescriptionListDescription></DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Replica Status</Title>
            <Grid hasGutter>
              <GridItem span={6}><div className="os-deployment__replica-label">Desired</div><Title headingLevel="h2" size="xl">{replicas}</Title></GridItem>
              <GridItem span={6}><div className="os-deployment__replica-label">Ready</div><Title headingLevel="h2" size="xl">{ready}</Title></GridItem>
              <GridItem span={12}><Progress value={replicas > 0 ? (ready / replicas) * 100 : 0} title="Replica availability" variant={ProgressVariant.success} /></GridItem>
            </Grid>
          </CardBody>
        </Card>
      </GridItem>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Conditions</Title>
            {conditions.map((c) => (
              <div key={String(c['type'])} className="os-deployment__condition">
                <div className="os-deployment__condition-header">
                  <strong>{String(c['type'] ?? '')}</strong>
                  <StatusIndicator status={String(c['status'] ?? '')} />
                </div>
                <div className="os-deployment__condition-message">{String(c['message'] ?? '')}</div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Labels</Title>
            <div className="os-detail__labels-wrap">
              {Object.entries(labels).map(([k, v]) => (
                <Label key={k} color="blue"><code className="os-detail__label-code">{k}={v}</code></Label>
              ))}
            </div>
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  );

  const rolloutTab = (
    <Card>
      <CardBody>
        <Title headingLevel="h3" size="lg" className="os-detail__section-title">Rollout History</Title>
        {rolloutHistory.length === 0 ? (
          <p className="os-text-muted">No rollout history available.</p>
        ) : (
          <Table aria-label="Rollout history" variant="compact">
            <Thead><Tr><Th>Revision</Th><Th>Image</Th><Th>Replicas</Th><Th>Ready</Th><Th>Created</Th></Tr></Thead>
            <Tbody>
              {rolloutHistory.map((r, i) => (
                <Tr key={i}>
                  <Td><Label color={i === 0 ? 'green' : 'grey'}>{r.revision}{i === 0 ? ' (current)' : ''}</Label></Td>
                  <Td><code>{r.image}</code></Td>
                  <Td>{r.replicas}</Td>
                  <Td>{r.ready}</Td>
                  <Td>{r.created}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );

  return (
    <ResourceDetailPage
      kind="Deployment"
      name={String(meta?.['name'] ?? '')}
      namespace={String(meta?.['namespace'] ?? '')}
      status={statusText}
      backPath="/workloads/deployments"
      backLabel="Deployments"
      yaml={yaml}
      apiUrl={`${BASE}/apis/apps/v1/namespaces/${namespace}/deployments/${name}`}
      onYamlSaved={(newYaml) => { setYaml(newYaml); setDeploy(JSON.parse(newYaml)); }}
      labels={labels}
      rawResource={deploy}
      tabs={[
        { title: 'Details', content: detailsTab },
        { title: 'Rollout History', content: rolloutTab },
      ]}
    />
  );
}
