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

const BASE = '/api/kubernetes';

interface GenericResourceDetailProps {
  kind: string;
  apiPath: (params: Record<string, string>) => string;
  backPath: string;
  backLabel: string;
  statusField?: string[];
}

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function formatAge(ts: string | undefined): string {
  if (!ts) return '-';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return `${Math.floor(diff / 60000)}m ago`;
}

function renderValue(value: unknown): React.ReactNode {
  if (value == null) return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    if (typeof value[0] === 'string') return value.join(', ');
    return `${value.length} items`;
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export default function GenericResourceDetail({ kind, apiPath, backPath, backLabel, statusField }: GenericResourceDetailProps) {
  const params = useParams();
  const [resource, setResource] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const name = params['name'] ?? params['*'] ?? '';
  const namespace = params['namespace'];

  useEffect(() => {
    async function load() {
      try {
        const path = apiPath(params as Record<string, string>);
        const res = await fetch(`${BASE}${path}`);
        if (res.ok) {
          setResource(await res.json() as Record<string, unknown>);
        }
      } catch {
        // API may not be available
      }
      setLoading(false);
    }
    load();
  }, [name, namespace]);

  if (loading) return <div className="os-text-muted" role="status">Loading...</div>;
  if (!resource) return <div className="os-text-muted">Resource not found</div>;

  const metadata = resource['metadata'] as Record<string, unknown> | undefined;
  const spec = resource['spec'] as Record<string, unknown> | undefined;
  const statusObj = resource['status'] as Record<string, unknown> | undefined;
  const labels = (metadata?.['labels'] ?? {}) as Record<string, string>;
  const annotations = (metadata?.['annotations'] ?? {}) as Record<string, string>;

  const statusValue = statusField ? String(getNestedValue(resource, statusField) ?? '') : undefined;
  const yamlContent = JSON.stringify(resource, null, 2);
  const resourceApiUrl = `${BASE}${apiPath(params as Record<string, string>)}`;

  const specEntries = spec ? Object.entries(spec).filter(([, v]) => typeof v !== 'object' || v === null) : [];
  const statusEntries = statusObj ? Object.entries(statusObj).filter(([, v]) => typeof v !== 'object' || v === null) : [];

  const detailsTab = (
    <Grid hasGutter>
      <GridItem md={6}>
        <Card>
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">{kind} Details</Title>
            <DescriptionList isCompact>
              <DescriptionListGroup>
                <DescriptionListTerm>Name</DescriptionListTerm>
                <DescriptionListDescription><strong>{name}</strong></DescriptionListDescription>
              </DescriptionListGroup>
              {namespace && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Namespace</DescriptionListTerm>
                  <DescriptionListDescription>{namespace}</DescriptionListDescription>
                </DescriptionListGroup>
              )}
              {statusValue && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Status</DescriptionListTerm>
                  <DescriptionListDescription><StatusIndicator status={statusValue ?? ""} /></DescriptionListDescription>
                </DescriptionListGroup>
              )}
              <DescriptionListGroup>
                <DescriptionListTerm>Created</DescriptionListTerm>
                <DescriptionListDescription>{formatAge(metadata?.['creationTimestamp'] as string)}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>UID</DescriptionListTerm>
                <DescriptionListDescription><code>{String(metadata?.['uid'] ?? '-')}</code></DescriptionListDescription>
              </DescriptionListGroup>
              {specEntries.map(([key, val]) => (
                <DescriptionListGroup key={key}>
                  <DescriptionListTerm>{key}</DescriptionListTerm>
                  <DescriptionListDescription>{renderValue(val)}</DescriptionListDescription>
                </DescriptionListGroup>
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
                  <DescriptionListGroup key={key}>
                    <DescriptionListTerm>{key}</DescriptionListTerm>
                    <DescriptionListDescription>{renderValue(val)}</DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
            </CardBody>
          </Card>
        )}

        <Card className="os-detail__card--spaced">
          <CardBody>
            <Title headingLevel="h3" size="lg" className="os-detail__section-title">Annotations</Title>
            <div className="os-detail__labels-wrap">
              {Object.keys(annotations).length > 0 ? Object.entries(annotations).slice(0, 10).map(([k, _v]) => (
                <Label key={k} color="grey"><code className="os-detail__label-code">{k}</code></Label>
              )) : <span className="os-text-muted">No annotations</span>}
            </div>
          </CardBody>
        </Card>
      </GridItem>
    </Grid>
  );

  return (
    <ResourceDetailPage
      kind={kind}
      name={name}
      namespace={namespace ?? ""}
      status={statusValue ?? ""}
      backPath={backPath}
      backLabel={backLabel}
      yaml={yamlContent}
      apiUrl={resourceApiUrl}
      onYamlSaved={(newYaml) => setResource(JSON.parse(newYaml))}
      rawResource={resource}
      tabs={[{ title: 'Details', content: detailsTab }]}
    />
  );
}
