import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownList, DropdownItem, MenuToggle, Divider, Label } from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useK8sResource, ageFromTimestamp, type K8sMeta } from '@/hooks/useK8sResource';
import { useUIStore } from '@/store/useUIStore';
import ConfirmDialog from '@/components/ConfirmDialog';

interface RoleBinding {
  name: string;
  namespace: string;
  kind: string;
  roleRef: string;
  subjects: string;
  age: string;
}

interface RawRoleBinding extends K8sMeta {
  kind: string;
  roleRef: { name: string };
  subjects?: { kind: string; name: string }[];
}

function RoleBindingActions({ rb }: { rb: RoleBinding }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Dropdown
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        toggle={(toggleRef) => (
          <MenuToggle ref={toggleRef} variant="plain" onClick={() => setMenuOpen(!menuOpen)} aria-label="Actions">
            <EllipsisVIcon />
          </MenuToggle>
        )}
        popperProps={{ position: 'right' }}
      >
        <DropdownList>
          <DropdownItem onClick={() => {
            setMenuOpen(false);
            navigate(`/administration/rolebindings/${rb.namespace}/${rb.name}`);
          }}>
            Edit RoleBinding
          </DropdownItem>
          <DropdownItem onClick={() => {
            setMenuOpen(false);
            navigate(`/administration/rolebindings/${rb.namespace}/${rb.name}?tab=yaml`);
          }}>
            View YAML
          </DropdownItem>
          <Divider />
          <DropdownItem
            onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
            {...(rb.kind === 'ClusterRoleBinding' ? {} : { isDanger: true })}
            isDisabled={rb.kind === 'ClusterRoleBinding'}
          >
            Delete
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setDeleteOpen(false);
          const path = rb.kind === 'ClusterRoleBinding'
            ? `/api/kubernetes/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${encodeURIComponent(rb.name)}`
            : `/api/kubernetes/apis/rbac.authorization.k8s.io/v1/namespaces/${encodeURIComponent(rb.namespace)}/rolebindings/${encodeURIComponent(rb.name)}`;
          try {
            const res = await fetch(path, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            addToast({ type: 'success', title: `RoleBinding ${rb.name} deleted` });
          } catch (err) {
            addToast({ type: 'error', title: 'Delete failed', description: err instanceof Error ? err.message : String(err) });
          }
        }}
        title="Delete RoleBinding"
        description={`Remove "${rb.name}"? The subject "${rb.subjects}" will lose "${rb.roleRef}" access${rb.namespace !== '-' ? ` in namespace "${rb.namespace}"` : ''}.`}
      />
    </span>
  );
}

const columns: ColumnDef<RoleBinding>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Namespace', key: 'namespace', render: (rb) => rb.namespace === '-' ? <span className="os-text-muted">All (cluster)</span> : rb.namespace },
  { title: 'Kind', key: 'kind', render: (rb) => <Label color={rb.kind === 'ClusterRoleBinding' ? 'purple' : 'teal'}>{rb.kind}</Label> },
  { title: 'Role', key: 'roleRef', render: (rb) => <code>{rb.roleRef}</code> },
  { title: 'Subjects', key: 'subjects' },
  { title: 'Age', key: 'age' },
  { title: '', key: 'actions', render: (rb) => <RoleBindingActions rb={rb} />, sortable: false },
];

function transformRoleBinding(item: RawRoleBinding): RoleBinding {
  const subj = item.subjects?.[0];
  return {
    name: item.metadata.name,
    namespace: item.metadata.namespace ?? '-',
    kind: item.kind ?? (item.metadata.namespace ? 'RoleBinding' : 'ClusterRoleBinding'),
    roleRef: item.roleRef.name,
    subjects: subj ? `${subj.kind}: ${subj.name}` : '-',
    age: ageFromTimestamp(item.metadata.creationTimestamp),
  };
}

export default function RoleBindings() {
  const navigate = useNavigate();
  const clusterBindings = useK8sResource<RawRoleBinding, RoleBinding>(
    '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings',
    transformRoleBinding,
  );
  const namespacedBindings = useK8sResource<RawRoleBinding, RoleBinding>(
    '/apis/rbac.authorization.k8s.io/v1/rolebindings',
    transformRoleBinding,
  );

  const data = useMemo(
    () => [...clusterBindings.data, ...namespacedBindings.data],
    [clusterBindings.data, namespacedBindings.data],
  );
  const loading = clusterBindings.loading || namespacedBindings.loading;

  return (
    <ResourceListPage
      title="Role Bindings"
      description="Manage access control by binding roles to users, groups, and service accounts"
      columns={columns}
      data={data}
      loading={loading}
      getRowKey={(rb) => `${rb.kind}-${rb.namespace}-${rb.name}`}
      createLabel="Create RoleBinding"
      nameField="name"
      onRowClick={(item) => navigate(`/administration/rolebindings/${item.namespace}/${item.name}`)}
      filterFn={(rb, s) => {
        const q = s.toLowerCase();
        return rb.name.toLowerCase().includes(q) || rb.subjects.toLowerCase().includes(q) || rb.roleRef.toLowerCase().includes(q);
      }}
    />
  );
}
