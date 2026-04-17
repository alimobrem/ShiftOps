// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResourceTable } from '../ResourceTable';

vi.mock('../../../views/TableView', () => ({
  compareValues: (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? '')),
}));

vi.mock('../../../engine/query', () => ({
  k8sDelete: vi.fn(),
  getImpersonationHeaders: () => ({}),
}));

vi.mock('../../feedback/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title }: any) => open ? <div data-testid="confirm-dialog">{title}</div> : null,
}));

vi.mock('../../../hooks/useResourceUrl', () => ({
  buildApiPath: (gvr: string, ns?: string, name?: string) => `/api/${gvr}/${ns}/${name}`,
}));

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

const columns = [
  { id: 'name', header: 'Name' },
  { id: 'status', header: 'Status' },
];

const rows = [
  { name: 'pod-1', status: 'Running' },
  { name: 'pod-2', status: 'Failed' },
  { name: 'pod-3', status: 'Running' },
];

describe('ResourceTable', () => {
  it('renders rows and title', () => {
    render(wrap(<ResourceTable columns={columns} rows={rows} title="Pods" />));
    expect(screen.getByText('pod-1')).toBeTruthy();
    expect(screen.getByText('pod-2')).toBeTruthy();
    expect(screen.getByText('pod-3')).toBeTruthy();
    expect(screen.getByText('Pods')).toBeTruthy();
  });

  it('shows empty state when no rows', () => {
    render(wrap(<ResourceTable columns={columns} rows={[]} title="Empty" />));
    expect(screen.getByText('No data available')).toBeTruthy();
  });

  it('has a search input', () => {
    render(wrap(<ResourceTable columns={columns} rows={rows} title="Pods" />));
    expect(screen.getAllByPlaceholderText('Search...').length).toBeGreaterThanOrEqual(1);
  });

  it('shows action buttons when showActions enabled', () => {
    const rowsWithGvr = rows.map((r) => ({ ...r, _gvr: 'v1~pods', namespace: 'default' }));
    render(wrap(<ResourceTable columns={columns} rows={rowsWithGvr} title="Pods" showActions />));
    expect(screen.getAllByTitle('Open detail view').length).toBe(3);
    expect(screen.getAllByTitle('View YAML').length).toBe(3);
    expect(screen.getAllByTitle('Delete').length).toBe(3);
  });

  it('opens delete confirm dialog on delete click', () => {
    const rowsWithGvr = [{ name: 'pod-1', status: 'Running', _gvr: 'v1~pods', namespace: 'default' }];
    render(wrap(<ResourceTable columns={columns} rows={rowsWithGvr} title="Pods" showActions />));
    const deleteButtons = screen.getAllByTitle('Delete');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
  });

  it('renders headerExtra and footerExtra', () => {
    render(wrap(
      <ResourceTable
        columns={columns}
        rows={rows}
        headerExtra={<span data-testid="header-extra">Live</span>}
        footerExtra={<span data-testid="footer-extra">Sources</span>}
      />
    ));
    expect(screen.getByTestId('header-extra')).toBeTruthy();
    expect(screen.getByTestId('footer-extra')).toBeTruthy();
  });

  it('renders table rows', () => {
    render(wrap(<ResourceTable columns={columns} rows={rows} onRowClick={() => {}} />));
    const tableRows = screen.getAllByRole('row');
    // header row + 3 data rows
    expect(tableRows.length).toBeGreaterThanOrEqual(4);
  });
});
