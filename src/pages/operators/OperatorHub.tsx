import React from 'react';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  Gallery,
  GalleryItem,
  Label,
  Button,
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { useUIStore } from '@/store/useUIStore';
import { useK8sResource, type K8sMeta } from '@/hooks/useK8sResource';
import '@/openshift-components.css';

interface Operator {
  name: string;
  displayName: string;
  provider: string;
  description: string;
  version: string;
  category: string;
  installed: boolean;
}

interface RawPackageManifest extends K8sMeta {
  status?: {
    catalogSource?: string;
    channels?: {
      name: string;
      currentCSV?: string;
      currentCSVDesc?: {
        displayName?: string;
        version?: string;
        provider?: { name?: string };
        annotations?: Record<string, string>;
        description?: string;
      };
    }[];
  };
}

const categoryColors: Record<string, 'blue' | 'purple' | 'teal' | 'orange' | 'green'> = {
  Monitoring: 'blue',
  Logging: 'purple',
  Security: 'teal',
  Networking: 'orange',
  Database: 'green',
};

export default function OperatorHub() {
  const [searchValue, setSearchValue] = React.useState('');
  const addToast = useUIStore((s) => s.addToast);

  const handleInstall = async (op: Operator) => {
    try {
      const res = await fetch('/api/kubernetes/apis/operators.coreos.com/v1alpha1/namespaces/openshift-operators/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiVersion: 'operators.coreos.com/v1alpha1', kind: 'Subscription',
          metadata: { name: op.name, namespace: 'openshift-operators' },
          spec: { channel: 'stable', name: op.name, source: 'community-operators', sourceNamespace: 'openshift-marketplace' },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `Installing ${op.displayName}` });
    } catch (err) {
      addToast({ type: 'error', title: 'Install failed', description: err instanceof Error ? err.message : String(err) });
    }
  };

  const { data, loading } = useK8sResource<RawPackageManifest, Operator>(
    '/apis/packages.operators.coreos.com/v1/packagemanifests',
    (item) => {
      const channel = item.status?.channels?.[0];
      const desc = channel?.currentCSVDesc;
      const category = desc?.annotations?.['categories'] ?? 'Other';
      return {
        name: item.metadata.name,
        displayName: desc?.displayName ?? item.metadata.name,
        provider: desc?.provider?.name ?? '-',
        description: desc?.description?.slice(0, 120) ?? '',
        version: desc?.version ?? '-',
        category: category.split(',')[0]?.trim() ?? 'Other',
        installed: false,
      };
    },
  );

  const filtered = data.filter((op) =>
    op.displayName.toLowerCase().includes(searchValue.toLowerCase()) ||
    op.category.toLowerCase().includes(searchValue.toLowerCase()) ||
    op.provider.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">OperatorHub</Title>
        <p className="os-operatorhub__description">
          Discover and install operators to extend your cluster capabilities
        </p>
      </PageSection>

      <PageSection>
        <Toolbar id="operatorhub-toolbar" className="os-operatorhub__toolbar">
          <ToolbarContent>
            <ToolbarItem className="os-operatorhub__toolbar-search">
              <SearchInput
                placeholder="Search operators by name or category..."
                value={searchValue}
                onChange={(_e, v) => setSearchValue(v)}
                onClear={() => setSearchValue('')}
              />
            </ToolbarItem>
            <ToolbarItem>
              <span className="os-text-muted">{filtered.length} operators</span>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {loading ? (
          <p className="os-text-muted">Loading operators...</p>
        ) : (
          <Gallery hasGutter minWidths={{ default: '100%', sm: '280px', md: '300px' }}>
            {filtered.slice(0, 30).map((op) => (
              <GalleryItem key={op.name}>
                <Card isFullHeight className="os-operatorhub__card">
                  <CardBody>
                    <div className="os-operatorhub__card-header">
                      <div className="os-operatorhub__icon">
                        {op.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="os-operatorhub__info">
                        <div className="os-operatorhub__name">{op.displayName}</div>
                        <div className="os-operatorhub__provider">by {op.provider}</div>
                      </div>
                    </div>
                    <p className="os-operatorhub__card-desc">
                      {op.description || 'No description available.'}
                    </p>
                    <div className="os-operatorhub__card-footer">
                      <div className="os-operatorhub__label-group">
                        <Label color={categoryColors[op.category] ?? 'grey'}>{op.category}</Label>
                        <Label color="grey">{op.version}</Label>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleInstall(op)}
                      >
                        Install
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
