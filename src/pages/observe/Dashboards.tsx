import {
  PageSection,
  Title,
  Card,
  CardBody,
  Gallery,
  GalleryItem,
  Label,
  Button,
} from '@patternfly/react-core';
import { useUIStore } from '@/store/useUIStore';
import { useK8sResource, type K8sMeta } from '@/hooks/useK8sResource';
import '@/openshift-components.css';

interface Dashboard {
  name: string;
  namespace: string;
  title: string;
}

interface RawConfigMap extends K8sMeta {
  data?: Record<string, string>;
}

function formatTitle(name: string): string {
  return name
    .replace(/^dashboard-/, '')
    .replace(/^grafana-dashboard-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Dashboards() {
  const addToast = useUIStore((s) => s.addToast);

  const { data, loading } = useK8sResource<RawConfigMap, Dashboard>(
    '/api/v1/namespaces/openshift-config-managed/configmaps',
    (item) => ({
      name: item.metadata.name,
      namespace: item.metadata.namespace ?? '',
      title: formatTitle(item.metadata.name),
    }),
  );

  const dashboards = data.filter((d) =>
    d.name.startsWith('dashboard-') || d.name.startsWith('grafana-dashboard-') || d.name.includes('etcd')
  );

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">Dashboards</Title>
        <p className="os-dashboards__description">
          {dashboards.length} monitoring dashboards available
        </p>
      </PageSection>

      <PageSection>
        {loading ? (
          <p className="os-text-muted">Loading dashboards...</p>
        ) : dashboards.length === 0 ? (
          <Card>
            <CardBody>
              <p className="os-text-muted">No dashboards found.</p>
            </CardBody>
          </Card>
        ) : (
          <Gallery hasGutter minWidths={{ default: '100%', sm: '280px', md: '320px' }}>
            {dashboards.map((dash) => (
              <GalleryItem key={dash.name}>
                <Card isFullHeight className="os-dashboards__card">
                  <CardBody>
                    <div className="os-dashboards__card-header">
                      <div className="os-dashboards__card-title">{dash.title}</div>
                      <p className="os-dashboards__card-desc">{dash.name}</p>
                    </div>
                    <div className="os-dashboards__card-footer">
                      <Label color="blue">Monitoring</Label>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addToast({ type: 'info', title: `Opening ${dash.title}` })}
                      >
                        View
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </GalleryItem>
            ))}
          </Gallery>
        )}
      </PageSection>
    </>
  );
}
