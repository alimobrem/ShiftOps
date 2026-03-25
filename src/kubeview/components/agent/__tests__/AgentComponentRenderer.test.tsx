// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentComponentRenderer } from '../AgentComponentRenderer';
import type { TabsSpec, GridSpec, SectionSpec } from '../../../engine/agentComponents';

// Mock child primitives to avoid deep dependency chains
vi.mock('../../primitives/Badge', () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock('../../primitives/InfoCard', () => ({
  InfoCard: ({ label }: any) => <div data-testid="info-card">{label}</div>,
}));

describe('AgentComponentRenderer — layout types', () => {
  it('renders TabsSpec with tab switching', () => {
    const spec: TabsSpec = {
      kind: 'tabs',
      tabs: [
        {
          label: 'Overview',
          components: [{ kind: 'key_value', pairs: [{ key: 'Cluster', value: 'prod' }] }],
        },
        {
          label: 'Details',
          components: [{ kind: 'key_value', pairs: [{ key: 'Region', value: 'us-east' }] }],
        },
      ],
    };

    render(<AgentComponentRenderer spec={spec} />);

    // Both tab buttons visible
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();

    // First tab content visible by default
    expect(screen.getByText('Cluster')).toBeTruthy();
    expect(screen.queryByText('Region')).toBeFalsy();

    // Click second tab
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText('Region')).toBeTruthy();
    expect(screen.queryByText('Cluster')).toBeFalsy();
  });

  it('renders GridSpec with correct column layout', () => {
    const spec: GridSpec = {
      kind: 'grid',
      columns: 3,
      items: [
        { kind: 'key_value', pairs: [{ key: 'A', value: '1' }] },
        { kind: 'key_value', pairs: [{ key: 'B', value: '2' }] },
        { kind: 'key_value', pairs: [{ key: 'C', value: '3' }] },
      ],
    };

    const { container } = render(<AgentComponentRenderer spec={spec} />);
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid).toBeTruthy();
    expect((grid as HTMLElement).style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    // All items rendered
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('renders SectionSpec with collapse/expand', () => {
    const spec: SectionSpec = {
      kind: 'section',
      title: 'Pod Status',
      description: 'Current pod statuses',
      collapsible: true,
      defaultOpen: true,
      components: [{ kind: 'key_value', pairs: [{ key: 'Pods', value: '42' }] }],
    };

    render(<AgentComponentRenderer spec={spec} />);

    // Title and description visible
    expect(screen.getByText('Pod Status')).toBeTruthy();
    expect(screen.getByText('Current pod statuses')).toBeTruthy();

    // Content visible when open
    expect(screen.getByText('Pods')).toBeTruthy();

    // Collapse
    fireEvent.click(screen.getByText('Pod Status'));
    expect(screen.queryByText('Pods')).toBeFalsy();

    // Expand again
    fireEvent.click(screen.getByText('Pod Status'));
    expect(screen.getByText('Pods')).toBeTruthy();
  });

  it('handles nested components (grid inside tabs)', () => {
    const spec: TabsSpec = {
      kind: 'tabs',
      tabs: [
        {
          label: 'Grid Tab',
          components: [
            {
              kind: 'grid',
              columns: 2,
              items: [
                { kind: 'key_value', pairs: [{ key: 'Nested', value: 'yes' }] },
              ],
            },
          ],
        },
      ],
    };

    render(<AgentComponentRenderer spec={spec} />);
    expect(screen.getByText('Grid Tab')).toBeTruthy();
    expect(screen.getByText('Nested')).toBeTruthy();
  });
});
