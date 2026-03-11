import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownList, DropdownItem, MenuToggle, Divider } from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import ResourceListPage, { type ColumnDef } from '@/components/ResourceListPage';
import { useClusterStore, type Pod } from '@/store/useClusterStore';
import { useUIStore } from '@/store/useUIStore';
import ConfirmDialog from '@/components/ConfirmDialog';
import '@/openshift-components.css';

/* Pod detail page has a Logs tab at index 1 */

function PodActions({ pod }: { pod: Pod }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const restartPod = useClusterStore((s) => s.restartPod);
  const deletePod = useClusterStore((s) => s.deletePod);
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
            restartPod(pod.namespace, pod.name);
            addToast({ type: 'info', title: `Restarting ${pod.name}`, description: 'Pod will restart shortly' });
          }}>
            Restart Pod
          </DropdownItem>
          <DropdownItem onClick={() => {
            setMenuOpen(false);
            navigate(`/workloads/pods/${pod.namespace}/${pod.name}?tab=logs`);
          }}>
            View Logs
          </DropdownItem>
          <Divider />
          <DropdownItem onClick={() => { setMenuOpen(false); setDeleteOpen(true); }} className="os-pods__delete-action">
            Delete Pod
          </DropdownItem>
        </DropdownList>
      </Dropdown>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deletePod(pod.namespace, pod.name);
          addToast({ type: 'success', title: `Pod deleted`, description: `${pod.name} has been removed` });
        }}
        title="Delete Pod"
        description={`Are you sure you want to delete pod "${pod.name}" in namespace "${pod.namespace}"? This action cannot be undone.`}
      />
    </span>
  );
}

const columns: ColumnDef<Pod>[] = [
  { title: 'Name', key: 'name' },
  { title: 'Namespace', key: 'namespace' },
  { title: 'Status', key: 'status' },
  { title: 'Restarts', key: 'restarts' },
  { title: 'Age', key: 'age', render: () => '2h', sortable: false },
  { title: '', key: 'actions', render: (p) => <PodActions pod={p} />, sortable: false },
];

export default function Pods() {
  const navigate = useNavigate();
  const { pods, fetchClusterData } = useClusterStore();

  useEffect(() => { fetchClusterData(); }, [fetchClusterData]);

  return (
    <ResourceListPage
      title="Pods"
      description="View and manage pod instances across all namespaces"
      columns={columns}
      data={pods}
      getRowKey={(p) => `${p.namespace}-${p.name}`}
      onRowClick={(p) => navigate(`/workloads/pods/${p.namespace}/${p.name}`)}
      createLabel="Create Pod"
      statusField="status"
      nameField="name"
      filterFn={(p, s) => p.name.toLowerCase().includes(s.toLowerCase()) || p.namespace.toLowerCase().includes(s.toLowerCase())}
    />
  );
}
