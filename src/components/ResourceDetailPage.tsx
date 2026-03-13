import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PageSection,
  Title,
  Breadcrumb,
  BreadcrumbItem,
  Tabs,
  Tab,
  TabTitleText,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { TrashIcon, EditIcon } from '@patternfly/react-icons';
import StatusIndicator from './StatusIndicator';
import ConfirmDialog from './ConfirmDialog';
import RelatedResources from './RelatedResources';
import OwnershipBadge from './OwnershipBadge';
import DependencyGraphView from './DependencyGraphView';
import YamlEditor from './YamlEditor';
import { useUIStore } from '@/store/useUIStore';

interface DetailTab {
  title: string;
  content: React.ReactNode;
}

interface ResourceDetailPageProps {
  kind: string;
  name: string;
  namespace?: string;
  status?: string;
  statusExtra?: React.ReactNode;
  backPath: string;
  backLabel: string;
  tabs: DetailTab[];
  yaml?: string;
  /** K8s API URL for this resource (enables save in YAML editor) */
  apiUrl?: string;
  /** Called when YAML is saved successfully */
  onYamlSaved?: (newYaml: string) => void;
  labels?: Record<string, string>;
  /** Raw K8s resource object (for ownership detection) */
  rawResource?: Record<string, unknown>;
}

export default function ResourceDetailPage({
  kind,
  name,
  namespace,
  status,
  statusExtra,
  backPath,
  backLabel,
  tabs,
  yaml,
  apiUrl,
  onYamlSaved,
  labels,
  rawResource,
}: ResourceDetailPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addToast = useUIStore((s) => s.addToast);
  const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const relatedKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'Pod', 'Service'];
  const showRelated = relatedKinds.includes(kind) && namespace;
  const graphKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'Service', 'Pod', 'Ingress', 'Route', 'Job'];
  const showGraph = graphKinds.includes(kind) && namespace;

  const allTabs = [
    ...tabs,
    ...(showGraph ? [{
      title: 'Dependencies',
      content: <DependencyGraphView kind={kind} name={name} namespace={namespace} />,
    }] : []),
    ...(showRelated ? [{
      title: 'Related',
      content: <RelatedResources kind={kind} name={name} namespace={namespace} labels={labels} />,
    }] : []),
    ...(yaml
      ? [{
          title: 'YAML',
          content: (
            <div className="os-detail__yaml-section">
              <YamlEditor value={yaml} name={name} apiUrl={apiUrl} onSaved={onYamlSaved} />
            </div>
          ),
        }]
      : []),
  ];

  // Sync active tab from ?tab= query param
  React.useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam) return;
    const idx = allTabs.findIndex((t) => t.title.toLowerCase() === tabParam.toLowerCase());
    if (idx >= 0) setActiveTabKey(idx);
  }, [searchParams, allTabs.length]);

  const handleEdit = () => {
    setActiveTabKey(allTabs.length - 1);
    addToast({ type: 'info', title: 'Edit mode', description: 'Viewing YAML for ' + name });
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    setDeleteOpen(false);
    addToast({ type: 'success', title: `${kind} deleted`, description: `${name} has been removed` });
    navigate(backPath);
  };

  return (
    <>
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem to="#" onClick={() => navigate(backPath)}>
            {backLabel}
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{name}</BreadcrumbItem>
        </Breadcrumb>
        <div className="os-detail__header-row">
          <div>
            <Title headingLevel="h1" size="2xl">{name}</Title>
            <div className="os-detail__meta">
              {status && <StatusIndicator status={status} />}
              {rawResource && <OwnershipBadge resource={rawResource} />}
              {namespace && (
                <span className="os-detail__namespace">
                  Namespace: {namespace}
                </span>
              )}
              {statusExtra}
            </div>
          </div>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <Button variant="secondary" icon={<EditIcon />} onClick={handleEdit}>
                  Edit
                </Button>
              </ToolbarItem>
              <ToolbarItem>
                <Button variant="danger" icon={<TrashIcon />} onClick={handleDelete}>
                  Delete
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        </div>
      </PageSection>

      <PageSection>
        <Tabs activeKey={activeTabKey} onSelect={(_, tabIndex) => setActiveTabKey(tabIndex)}>
          {allTabs.map((tab, i) => (
            <Tab key={tab.title} eventKey={i} title={<TabTitleText>{tab.title}</TabTitleText>}>
              <div className="os-detail__tab-content">{tab.content}</div>
            </Tab>
          ))}
        </Tabs>
      </PageSection>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title={`Delete ${kind}`}
        description={`Are you sure you want to delete ${kind} "${name}"${namespace ? ` in namespace "${namespace}"` : ''}? This action cannot be undone.`}
      />
    </>
  );
}
