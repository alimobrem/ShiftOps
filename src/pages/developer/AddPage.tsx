import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  Gallery,
  GalleryItem,
  Button,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';
import { useUIStore } from '@/store/useUIStore';
import QuickDeployDialog from '@/components/QuickDeployDialog';

interface AddOption {
  title: string;
  description: string;
}

const addOptions: AddOption[] = [
  { title: 'From Git', description: 'Import code from a Git repository to be built and deployed' },
  { title: 'Container Image', description: 'Deploy an existing image from an image registry' },
  { title: 'From Dockerfile', description: 'Import your Dockerfile from a Git repository to be built and deployed' },
  { title: 'From Catalog', description: 'Browse the developer catalog to deploy applications and services' },
  { title: 'YAML', description: 'Create resources from their YAML or JSON definitions' },
  { title: 'Helm Chart', description: 'Browse the catalog to discover and install Helm Charts' },
  { title: 'Operator Backed', description: 'Browse the catalog to discover and deploy operator managed services' },
];

const navigationMap: Record<string, string> = {
  'From Git': '/developer/git-import',
  'From Dockerfile': '/developer/git-import',
  'From Catalog': '/operators/operatorhub',
  'Helm Chart': '/helm/charts',
  'Operator Backed': '/operators/installed',
};

export default function AddPage() {
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [yamlDialogOpen, setYamlDialogOpen] = useState(false);
  const [yamlValue, setYamlValue] = useState('');
  const [yamlApplying, setYamlApplying] = useState(false);

  const handleApplyYaml = useCallback(async () => {
    if (!yamlValue.trim()) return;
    setYamlApplying(true);
    try {
      // Parse YAML as JSON (K8s accepts JSON)
      let resource: Record<string, unknown>;
      try {
        resource = JSON.parse(yamlValue);
      } catch {
        // Simple YAML-to-JSON: try interpreting as JSON5-ish or error
        throw new Error('Please paste valid JSON. YAML parsing requires a YAML library.');
      }
      const apiVersion = String(resource['apiVersion'] ?? '');
      const kind = String(resource['kind'] ?? '');
      const meta = (resource['metadata'] ?? {}) as Record<string, string>;
      const ns = meta['namespace'] || 'default';

      if (!apiVersion || !kind) throw new Error('Resource must have apiVersion and kind');

      // Build API path from apiVersion and kind
      const plural = kind.toLowerCase() + 's'; // simple pluralization
      const apiBase = apiVersion.includes('/')
        ? `/api/kubernetes/apis/${apiVersion}/namespaces/${encodeURIComponent(ns)}/${plural}`
        : `/api/kubernetes/api/${apiVersion}/namespaces/${encodeURIComponent(ns)}/${plural}`;

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resource),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast({ type: 'success', title: `${kind} created`, description: `${meta['name'] ?? ''} in ${ns}` });
      setYamlDialogOpen(false);
      setYamlValue('');
    } catch (err) {
      addToast({ type: 'error', title: 'Apply failed', description: err instanceof Error ? err.message : String(err) });
    }
    setYamlApplying(false);
  }, [yamlValue, addToast]);

  const handleSelect = (title: string) => {
    if (title === 'Container Image') {
      setDeployDialogOpen(true);
      return;
    }
    if (title === 'YAML') {
      setYamlDialogOpen(true);
      return;
    }
    const path = navigationMap[title];
    if (path) {
      navigate(path);
    }
  };

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">+Add</Title>
        <p className="os-list__description">
          Add resources to your project
        </p>
      </PageSection>

      <PageSection>
        <Gallery hasGutter minWidths={{ default: '100%', sm: '280px', md: '300px' }}>
          {addOptions.map((option) => (
            <GalleryItem key={option.title}>
              <Card isFullHeight className="os-operatorhub__card">
                <CardBody>
                  <div className="os-operatorhub__card-header">
                    <div className="os-operatorhub__icon">
                      {option.title.charAt(0).toUpperCase()}
                    </div>
                    <div className="os-operatorhub__info">
                      <div className="os-operatorhub__name">{option.title}</div>
                    </div>
                  </div>
                  <p className="os-operatorhub__card-desc">
                    {option.description}
                  </p>
                  <div className="os-operatorhub__card-footer">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSelect(option.title)}
                    >
                      Select
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </GalleryItem>
          ))}
        </Gallery>
      </PageSection>

      <QuickDeployDialog open={deployDialogOpen} onClose={() => setDeployDialogOpen(false)} />

      <Modal
        variant={ModalVariant.large}
        isOpen={yamlDialogOpen}
        onClose={() => { setYamlDialogOpen(false); setYamlValue(''); }}
        aria-label="Import YAML"
      >
        <ModalHeader title="Import YAML" />
        <ModalBody>
          <p className="os-text-muted" style={{ marginBottom: 12 }}>
            Paste a Kubernetes resource definition in JSON format and click Apply to create the resource.
          </p>
          <textarea
            className="os-yaml-editor__textarea"
            style={{ width: '100%', minHeight: 300, fontFamily: 'monospace', fontSize: 13 }}
            placeholder={'{\n  "apiVersion": "v1",\n  "kind": "ConfigMap",\n  "metadata": {\n    "name": "example",\n    "namespace": "default"\n  },\n  "data": {\n    "key": "value"\n  }\n}'}
            value={yamlValue}
            onChange={(e) => setYamlValue(e.target.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleApplyYaml} isLoading={yamlApplying} isDisabled={!yamlValue.trim()}>
            Apply
          </Button>
          <Button variant="link" onClick={() => { setYamlDialogOpen(false); setYamlValue(''); }}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
