import React from 'react';
import {
  PageSection,
  Title,
  Card,
  CardBody,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  SearchInput,
  Button,
  Pagination,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { PlusCircleIcon } from '@patternfly/react-icons';
import StatusIndicator from './StatusIndicator';
import ResourceEmptyState from './ResourceEmptyState';
import ResourceListSkeleton from './ResourceListSkeleton';
import CreateResourceDialog from './CreateResourceDialog';
import { useClusterStore } from '@/store/useClusterStore';
import { useUIStore } from '@/store/useUIStore';

export interface ColumnDef<T> {
  title: string;
  key: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface CreateResourceConfig {
  /** e.g. "apps/v1" or "v1" */
  apiVersion: string;
  /** e.g. "Deployment" */
  kind: string;
  /** e.g. "/apis/apps/v1" or "/api/v1" */
  apiBase: string;
  /** e.g. "deployments" */
  plural: string;
  /** Extra fields beyond name/namespace */
  extraFields?: { name: string; label: string; placeholder: string; required?: boolean }[];
  /** Build the resource body from form data. If omitted, creates a minimal resource. */
  buildBody?: (formData: Record<string, string>) => Record<string, unknown>;
}

interface ResourceListPageProps<T> {
  title: string;
  description: string;
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  filterFn?: (item: T, search: string) => boolean;
  getRowKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  createLabel?: string;
  createHref?: string;
  createConfig?: CreateResourceConfig;
  onCreated?: () => void;
  statusField?: keyof T;
  nameField?: keyof T;
  toolbarExtra?: React.ReactNode;
}

export default function ResourceListPage<T>({
  title,
  description,
  columns,
  data,
  loading,
  filterFn,
  getRowKey,
  onRowClick,
  createLabel,
  createConfig,
  onCreated,
  statusField,
  nameField,
  toolbarExtra,
}: ResourceListPageProps<T>) {
  const addToast = useUIStore((s) => s.addToast);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const [searchValue, setSearchValue] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(20);
  const [sortIndex, setSortIndex] = React.useState<number | null>(null);
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');

  const defaultFilter = (item: T, search: string) => {
    const nf = nameField ?? ('name' as keyof T);
    const val = item[nf];
    return typeof val === 'string' && val.toLowerCase().includes(search.toLowerCase());
  };

  const filter = filterFn ?? defaultFilter;

  // Apply namespace filter from header selector
  const namespaceFiltered = selectedNamespace === 'all'
    ? data
    : data.filter((item) => {
        const ns = (item as Record<string, unknown>)['namespace'];
        return ns === undefined || ns === '' || ns === selectedNamespace;
      });

  const filtered = searchValue
    ? namespaceFiltered.filter((item) => filter(item, searchValue))
    : namespaceFiltered;

  // Reset page when namespace changes
  React.useEffect(() => { setPage(1); }, [selectedNamespace]);

  // Sort
  let sorted = filtered;
  if (sortIndex !== null) {
    const col = columns[sortIndex];
    if (col) {
      sorted = [...filtered].sort((a, b) => {
        const aVal = String((a as Record<string, unknown>)[col.key] ?? '');
        const bVal = String((b as Record<string, unknown>)[col.key] ?? '');
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
  }

  // Paginate
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  const onSort = (_event: React.MouseEvent, index: number, direction: 'asc' | 'desc') => {
    setSortIndex(index);
    setSortDirection(direction);
  };

  const handleCreate = () => {
    setCreateOpen(true);
  };

  const resourceKind = createConfig?.kind ?? title.replace(/s$/, '').replace(/ /g, '');
  const createFields = [
    { name: 'name', label: 'Name', placeholder: `my-${resourceKind.toLowerCase()}`, required: true },
    { name: 'namespace', label: 'Namespace', placeholder: 'default', required: true },
    ...(createConfig?.extraFields ?? []),
  ];

  const renderCell = (item: T, col: ColumnDef<T>) => {
    if (col.render) return col.render(item);
    const value = (item as Record<string, unknown>)[col.key];
    // Auto-detect status fields
    if (statusField && col.key === String(statusField)) {
      return <StatusIndicator status={String(value)} />;
    }
    if (nameField && col.key === String(nameField)) {
      return <strong>{String(value)}</strong>;
    }
    if (col.key === 'name' && !nameField) {
      return <strong>{String(value)}</strong>;
    }
    return String(value ?? '');
  };

  if (loading) {
    return (
      <>
        <PageSection variant="default">
          <Title headingLevel="h1" size="2xl">{title}</Title>
          <p className="os-list__description">{description}</p>
        </PageSection>
        <PageSection>
          <ResourceListSkeleton columns={columns.length} rows={5} />
        </PageSection>
      </>
    );
  }

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">{title}</Title>
        <p className="os-list__description">{description}</p>
      </PageSection>

      <PageSection>
        <Card>
          <CardBody>
            <Toolbar id={`${title.toLowerCase().replace(/\s/g, '-')}-toolbar`}>
              <ToolbarContent>
                <ToolbarItem>
                  <SearchInput
                    placeholder="Search by name..."
                    value={searchValue}
                    onChange={(_event, value) => { setSearchValue(value); setPage(1); }}
                    onClear={() => { setSearchValue(''); setPage(1); }}
                  />
                </ToolbarItem>
                {toolbarExtra}
                {createLabel && (
                  <ToolbarItem>
                    <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleCreate}>
                      {createLabel}
                    </Button>
                  </ToolbarItem>
                )}
                <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
                  <Pagination
                    itemCount={filtered.length}
                    perPage={perPage}
                    page={page}
                    onSetPage={(_e, p) => setPage(p)}
                    onPerPageSelect={(_e, pp) => { setPerPage(pp); setPage(1); }}
                    isCompact
                  />
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>

            <Table aria-label={`${title} table`} variant="compact">
              <Thead>
                <Tr>
                  {columns.map((col, i) => {
                    if (col.sortable === false) {
                      return <Th key={col.key}>{col.title}</Th>;
                    }
                    const sortBy = sortIndex !== null
                      ? { index: sortIndex, direction: sortDirection }
                      : { direction: sortDirection };
                    return (
                      <Th key={col.key} sort={{ sortBy, onSort, columnIndex: i }}>
                        {col.title}
                      </Th>
                    );
                  })}
                </Tr>
              </Thead>
              <Tbody>
                {paginated.length > 0 ? (
                  paginated.map((item) => (
                    <Tr
                      key={getRowKey(item)}
                      isClickable={!!onRowClick}
                      {...(onRowClick ? { onRowClick: () => onRowClick(item), className: 'os-list__row--clickable' } : {})}
                    >
                      {columns.map((col) => (
                        <Td key={col.key} dataLabel={col.title}>
                          {renderCell(item, col)}
                        </Td>
                      ))}
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={columns.length}>
                      <ResourceEmptyState
                        title={searchValue ? `No ${title.toLowerCase()} found` : `No ${title.toLowerCase()}`}
                        message={searchValue ? `No results matching "${searchValue}"` : `No ${title.toLowerCase()} exist yet.`}
                      />
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </PageSection>

      {createLabel && (
        <CreateResourceDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          resourceKind={resourceKind}
          fields={createFields}
          onSubmit={async (formData) => {
            if (createConfig) {
              const ns = formData['namespace'] || 'default';
              const name = formData['name'];
              const body = createConfig.buildBody
                ? createConfig.buildBody(formData)
                : {
                    apiVersion: createConfig.apiVersion,
                    kind: createConfig.kind,
                    metadata: { name, namespace: ns },
                  };
              try {
                const url = `/api/kubernetes${createConfig.apiBase}/namespaces/${encodeURIComponent(ns)}/${createConfig.plural}`;
                const res = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(await res.text());
                addToast({ type: 'success', title: `${resourceKind} created`, description: `${name} in ${ns}` });
                onCreated?.();
              } catch (err) {
                addToast({ type: 'error', title: 'Create failed', description: err instanceof Error ? err.message : String(err) });
              }
            } else {
              addToast({ type: 'success', title: `${resourceKind} created`, description: `${formData['name']} has been created` });
            }
            setCreateOpen(false);
          }}
        />
      )}
    </>
  );
}
