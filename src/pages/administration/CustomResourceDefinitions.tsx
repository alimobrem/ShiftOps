import { useNavigate } from 'react-router-dom';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { Label } from '@patternfly/react-core';

interface CustomResourceDefinition {
  name: string;
  group: string;
  version: string;
  scope: string;
  age: string;
}

interface RawCRD extends K8sMeta {
  spec: {
    group: string;
    versions: { name: string }[];
    scope: string;
  };
}

const columns: ColumnDef<CustomResourceDefinition>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Group', key: 'group' },
  { title: 'Version', key: 'version' },
  {
    title: 'Scope',
    key: 'scope',
    render: (crd) => (
      <Label color={crd.scope === 'Cluster' ? 'blue' : 'green'}>{crd.scope}</Label>
    ),
  },
  { title: 'Age', key: 'age' },
];

export default function CustomResourceDefinitions() {
  const navigate = useNavigate();
  const { data, loading } = useK8sResource<RawCRD, CustomResourceDefinition>(
    '/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
    (item) => ({
      name: item.metadata.name,
      group: item.spec.group,
      version: item.spec.versions[0]?.name ?? '-',
      scope: item.spec.scope,
      age: ageFromTimestamp(item.metadata.creationTimestamp),
    }),
  );

  return (
    <ResourceListPage
      title="Custom Resource Definitions"
      description="View and manage custom resource definitions extending the Kubernetes API"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(crd) => crd.name}
      nameField="name"
      onRowClick={(item) => navigate(`/administration/crds/${item.name}/instances`)}
    />
  );
}
