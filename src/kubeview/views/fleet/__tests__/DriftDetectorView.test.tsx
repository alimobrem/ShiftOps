// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../engine/fleetDrift', () => ({
  fleetCompareResource: vi.fn(),
}));

vi.mock('../../../engine/clusterConnection', () => ({
  getAllConnections: vi.fn(() => [
    { id: 'c1', name: 'cluster-1', status: 'connected' },
    { id: 'c2', name: 'cluster-2', status: 'connected' },
  ]),
}));

vi.mock('../../../store/clusterStore', () => ({
  useClusterStore: vi.fn((selector: any) =>
    selector({
      resourceRegistry: new Map([
        ['Deployment/apps/v1', {
          kind: 'Deployment',
          apiVersion: 'apps/v1',
          plural: 'deployments',
          namespaced: true,
        }],
        ['Service/v1', {
          kind: 'Service',
          apiVersion: 'v1',
          plural: 'services',
          namespaced: true,
        }],
      ]),
    }),
  ),
}));

import { DriftDetectorView } from '../DriftDetectorView';
import { fleetCompareResource } from '../../../engine/fleetDrift';

const mockCompare = vi.mocked(fleetCompareResource);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DriftDetectorView', () => {
  it('renders resource selector inputs', () => {
    render(<DriftDetectorView />);

    expect(screen.getByLabelText('Resource type')).toBeTruthy();
    expect(screen.getByLabelText('Namespace')).toBeTruthy();
    expect(screen.getByLabelText('Resource name')).toBeTruthy();
  });

  it('shows compare button', () => {
    render(<DriftDetectorView />);

    const buttons = screen.getAllByRole('button', { name: /compare/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows drift results after comparison', async () => {
    mockCompare.mockResolvedValue({
      resource: { apiPath: '/apis/apps/v1/deployments', name: 'my-app', namespace: 'default' },
      clusters: ['c1', 'c2'],
      diffs: [
        { field: 'spec.replicas', values: { c1: 3, c2: 5 }, drifted: true },
        { field: 'spec.strategy.type', values: { c1: 'RollingUpdate', c2: 'RollingUpdate' }, drifted: false },
      ],
      identicalFields: 1,
      driftedFields: 1,
    });

    render(<DriftDetectorView />);

    // Fill in inputs
    const selects = screen.getAllByLabelText('Resource type');
    const names = screen.getAllByLabelText('Resource name');
    const namespaces = screen.getAllByLabelText('Namespace');
    fireEvent.change(selects[0], { target: { value: 'Deployment/apps/v1' } });
    fireEvent.change(names[0], { target: { value: 'my-app' } });
    fireEvent.change(namespaces[0], { target: { value: 'default' } });

    const buttons = screen.getAllByRole('button', { name: /compare/i });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/1 of 2 fields match/).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('spec.replicas').length).toBeGreaterThan(0);
  });

  it('shows identical message when no drift', async () => {
    mockCompare.mockResolvedValue({
      resource: { apiPath: '/apis/apps/v1/deployments', name: 'my-app', namespace: 'default' },
      clusters: ['c1', 'c2'],
      diffs: [
        { field: 'spec.replicas', values: { c1: 3, c2: 3 }, drifted: false },
      ],
      identicalFields: 1,
      driftedFields: 0,
    });

    render(<DriftDetectorView />);

    const selects = screen.getAllByLabelText('Resource type');
    const names = screen.getAllByLabelText('Resource name');
    fireEvent.change(selects[0], { target: { value: 'Deployment/apps/v1' } });
    fireEvent.change(names[0], { target: { value: 'my-app' } });

    const buttons = screen.getAllByRole('button', { name: /compare/i });
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/Resources are identical across all clusters/).length).toBeGreaterThan(0);
    });
  });
});
