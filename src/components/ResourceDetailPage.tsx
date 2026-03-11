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
  Card,
  CardBody,
  CodeBlock,
  CodeBlockCode,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { TrashIcon, EditIcon, DownloadIcon, CopyIcon } from '@patternfly/react-icons';
import StatusIndicator from './StatusIndicator';
import ConfirmDialog from './ConfirmDialog';
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
}: ResourceDetailPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addToast = useUIStore((s) => s.addToast);
  const [activeTabKey, setActiveTabKey] = React.useState<string | number>(0);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const allTabs = [
    ...tabs,
    ...(yaml
      ? [{
          title: 'YAML',
          content: (
            <div className="os-detail__yaml-section">
              <Card>
                <CardBody>
                  <div className="os-detail__yaml-actions">
                    <Button
                      variant="secondary"
                      icon={<CopyIcon />}
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(yaml);
                        addToast({ type: 'success', title: 'YAML copied to clipboard' });
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<DownloadIcon />}
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([yaml], { type: 'text/yaml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${name}.yaml`;
                        a.click();
                        URL.revokeObjectURL(url);
                        addToast({ type: 'success', title: 'YAML downloaded' });
                      }}
                    >
                      Download
                    </Button>
                  </div>
                  <div className="compass-yaml-editor">
                    <CodeBlock>
                      <CodeBlockCode>{yaml}</CodeBlockCode>
                    </CodeBlock>
                  </div>
                </CardBody>
              </Card>
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
