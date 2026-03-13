import { useState, useEffect } from 'react';
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
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useParams } from 'react-router-dom';
import ResourceDetailPage from '@/components/ResourceDetailPage';
import StatusIndicator from '@/components/StatusIndicator';
import LogViewer from '@/components/LogViewer';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

interface PodData {
  name: string;
  namespace: string;
  status: string;
  podIP: string;
  nodeName: string;
  created: string;
  labels: Record<string, string>;
  containers: { name: string; image: string; ready: boolean; restartCount: number; state: string }[];
  conditions: { type: string; status: string; lastTransition: string }[];
}

export default function PodDetail() {
  const { namespace, name } = useParams();
  const [pod, setPod] = useState<PodData | null>(null);
  const [rawResource, setRawResource] = useState<Record<string, unknown> | null>(null);
  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}/api/v1/namespaces/${namespace}/pods/${name}`);
        if (res.ok) {
          const raw = await res.json() as Record<string, unknown>;
          const meta = raw['metadata'] as Record<string, unknown>;
          const spec = raw['spec'] as Record<string, unknown>;
          const status = raw['status'] as Record<string, unknown>;
          const containerStatuses = (status?.['containerStatuses'] ?? []) as Record<string, unknown>[];
          const containers = ((spec?.['containers'] ?? []) as Record<string, unknown>[]).map((c, i) => {
            const cs = containerStatuses[i];
            const stateObj = cs?.['state'] as Record<string, unknown> | undefined;
            const stateKey = stateObj ? Object.keys(stateObj)[0] ?? 'unknown' : 'unknown';
            return {
              name: String(c['name'] ?? ''),
              image: String(c['image'] ?? ''),
              ready: Boolean(cs?.['ready']),
              restartCount: Number(cs?.['restartCount'] ?? 0),
              state: stateKey.charAt(0).toUpperCase() + stateKey.slice(1),
            };
          });
          const conditions = ((status?.['conditions'] ?? []) as Record<string, unknown>[]).map((c) => ({
            type: String(c['type'] ?? ''),
            status: String(c['status'] ?? ''),
            lastTransition: String(c['lastTransitionTime'] ?? '-'),
          }));
          setPod({
            name: String(meta?.['name'] ?? name ?? ''),
            namespace: String(meta?.['namespace'] ?? namespace ?? ''),
            status: String(status?.['phase'] ?? 'Unknown'),
            podIP: String(status?.['podIP'] ?? '-'),
            nodeName: String(spec?.['nodeName'] ?? '-'),
            created: String(meta?.['creationTimestamp'] ?? '-'),
            labels: (meta?.['labels'] ?? {}) as Record<string, string>,
            containers,
            conditions,
          });
          setRawResource(raw);
          setYaml(JSON.stringify(raw, null, 2));
        }
      } catch {
        // API may not be available
      }
      setLoading(false);
    }
    load();
  }, [namespace, name]);

  if (loading) return <div className="os-text-muted" role="status">Loading...</div>;
  if (!pod) return <div className="os-text-muted">Pod not found</div>;

  const detailsTab = (
    <Grid hasGutter>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Pod Details</Title>
            <DescriptionList>
              <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription><strong>{pod.name}</strong></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Namespace</DescriptionListTerm><DescriptionListDescription>{pod.namespace}</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Status</DescriptionListTerm><DescriptionListDescription><StatusIndicator status={pod.status} /></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Pod IP</DescriptionListTerm><DescriptionListDescription><code>{pod.podIP}</code></DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Node</DescriptionListTerm><DescriptionListDescription>{pod.nodeName}</DescriptionListDescription></DescriptionListGroup>
              <DescriptionListGroup><DescriptionListTerm>Created</DescriptionListTerm><DescriptionListDescription>{pod.created}</DescriptionListDescription></DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Labels</Title>
            <div className="os-detail__labels-wrap">
              {Object.entries(pod.labels).map(([key, value]) => (
                <Label key={key} color="blue"><code className="os-detail__label-code">{key}={value}</code></Label>
              ))}
            </div>
          </CardBody>
        </Card>
      </GridItem>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Containers</Title>
            {pod.containers.map((c) => (
              <DescriptionList key={c.name}>
                <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription><strong>{c.name}</strong></DescriptionListDescription></DescriptionListGroup>
                <DescriptionListGroup><DescriptionListTerm>Image</DescriptionListTerm><DescriptionListDescription><code>{c.image}</code></DescriptionListDescription></DescriptionListGroup>
                <DescriptionListGroup><DescriptionListTerm>State</DescriptionListTerm><DescriptionListDescription><StatusIndicator status={c.state} /></DescriptionListDescription></DescriptionListGroup>
                <DescriptionListGroup><DescriptionListTerm>Restart Count</DescriptionListTerm><DescriptionListDescription>{c.restartCount}</DescriptionListDescription></DescriptionListGroup>
              </DescriptionList>
            ))}
          </CardBody>
        </Card>
        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Conditions</Title>
            <Table aria-label="Conditions table" variant="compact">
              <Thead><Tr><Th>Type</Th><Th>Status</Th><Th>Last Transition</Th></Tr></Thead>
              <Tbody>
                {pod.conditions.map((c) => (
                  <Tr key={c.type}><Td>{c.type}</Td><Td><StatusIndicator status={c.status} /></Td><Td>{c.lastTransition}</Td></Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  );

  const logsTab = (
    <LogViewer podName={pod.name} namespace={pod.namespace} containers={pod.containers.map((c) => c.name)} />
  );

  return (
    <ResourceDetailPage
      kind="Pod"
      name={pod.name}
      namespace={pod.namespace}
      status={pod.status}
      backPath="/workloads/pods"
      backLabel="Pods"
      yaml={yaml}
      apiUrl={`${BASE}/api/v1/namespaces/${namespace}/pods/${name}`}
      onYamlSaved={(newYaml) => setYaml(newYaml)}
      rawResource={rawResource ?? undefined}
      tabs={[
        { title: 'Details', content: detailsTab },
        { title: 'Logs', content: logsTab },
      ]}
    />
  );
}
