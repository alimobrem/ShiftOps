// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ViewSpec } from '../../engine/agentComponents';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ viewId: 'test-view' }),
  };
});

const mockGetView = vi.fn();
const mockDeleteView = vi.fn();

vi.mock('../../store/dynamicViewStore', () => ({
  useDynamicViewStore: (selector: any) =>
    selector({
      getView: mockGetView,
      deleteView: mockDeleteView,
    }),
}));

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: any) =>
    selector({
      addTab: vi.fn(),
    }),
}));

vi.mock('../../components/agent/AgentComponentRenderer', () => ({
  AgentComponentRenderer: ({ spec }: any) => (
    <div data-testid="agent-component">{spec.kind}</div>
  ),
}));

import { DynamicView } from '../DynamicView';

const testView: ViewSpec = {
  id: 'test-view',
  title: 'Cluster Health Dashboard',
  description: 'Overview of cluster health metrics',
  layout: [
    { kind: 'key_value', pairs: [{ key: 'status', value: 'healthy' }] },
    { kind: 'badge_list', badges: [{ text: 'Ready', variant: 'success' }] },
  ],
  generatedAt: 1700000000000,
};

describe('DynamicView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders view title and description', () => {
    mockGetView.mockReturnValue(testView);
    render(
      <MemoryRouter>
        <DynamicView />
      </MemoryRouter>,
    );
    expect(screen.getByText('Cluster Health Dashboard')).toBeTruthy();
    expect(screen.getByText('Overview of cluster health metrics')).toBeTruthy();
  });

  it('shows "View not found" for missing ID', () => {
    mockGetView.mockReturnValue(undefined);
    render(
      <MemoryRouter>
        <DynamicView />
      </MemoryRouter>,
    );
    expect(screen.getByText('View not found')).toBeTruthy();
  });

  it('renders components via AgentComponentRenderer', () => {
    mockGetView.mockReturnValue(testView);
    render(
      <MemoryRouter>
        <DynamicView />
      </MemoryRouter>,
    );
    const components = screen.getAllByTestId('agent-component');
    expect(components.length).toBeGreaterThanOrEqual(2);
    const kinds = components.map((c) => c.textContent);
    expect(kinds).toContain('key_value');
    expect(kinds).toContain('badge_list');
  });
});
