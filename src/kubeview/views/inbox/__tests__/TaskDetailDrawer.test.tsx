// @vitest-environment jsdom
/**
 * Tests that every inbox item status renders at least one action button
 * in the detail drawer. Catches dead-end states.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import type { InboxItem } from '../../../engine/inboxApi';

vi.mock('../../../store/inboxStore', () => ({
  useInboxStore: vi.fn((selector) => {
    const state = {
      resolve: vi.fn(),
      claim: vi.fn(),
      dismiss: vi.fn(),
      restore: vi.fn(),
      advanceStatus: vi.fn(),
      refresh: vi.fn(),
      setSelectedItem: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../../store/agentStore', () => ({
  useAgentStore: { getState: () => ({ connectAndSend: vi.fn() }) },
}));

vi.mock('../../../store/uiStore', () => ({
  useUIStore: { getState: () => ({ expandAISidebar: vi.fn(), setAISidebarMode: vi.fn(), addToast: vi.fn() }) },
}));

vi.mock('../../../engine/inboxApi', async () => {
  const actual = await vi.importActual('../../../engine/inboxApi');
  return {
    ...actual,
    escalateInboxItem: vi.fn().mockResolvedValue({ finding_id: 'inb-new' }),
    fetchInboxInvestigation: vi.fn().mockRejectedValue(new Error('not found')),
  };
});

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'inb-test',
    item_type: 'finding',
    status: 'new',
    title: 'Test item',
    summary: 'Test summary',
    severity: 'warning',
    priority_score: 2.0,
    confidence: 0.8,
    noise_score: 0,
    namespace: 'default',
    resources: [{ kind: 'Pod', name: 'test-pod', namespace: 'default' }],
    correlation_key: null,
    claimed_by: null,
    claimed_at: null,
    created_by: 'system:monitor',
    due_date: null,
    finding_id: null,
    view_id: null,
    pinned_by: [],
    metadata: {},
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
    resolved_at: null,
    snoozed_until: null,
    ...overrides,
  };
}

const ALL_STATUSES: Array<{ status: string; item_type: string; metadata?: Record<string, unknown> }> = [
  { status: 'new', item_type: 'finding' },
  { status: 'agent_reviewing', item_type: 'finding' },
  { status: 'agent_cleared', item_type: 'finding', metadata: { dismiss_reason: 'No issue found' } },
  { status: 'acknowledged', item_type: 'finding', metadata: { triaged: true, triage_action: 'investigate' } },
  { status: 'investigating', item_type: 'finding' },
  { status: 'action_taken', item_type: 'finding' },
  { status: 'verifying', item_type: 'finding' },
  { status: 'resolved', item_type: 'finding' },
  { status: 'escalated', item_type: 'assessment', metadata: { escalated_to: 'inb-finding' } },
  { status: 'new', item_type: 'task' },
  { status: 'agent_reviewing', item_type: 'task' },
  { status: 'in_progress', item_type: 'task' },
  { status: 'acknowledged', item_type: 'alert' },
  { status: 'acknowledged', item_type: 'assessment' },
];

describe('TaskDetailDrawer — no dead-end states', () => {
  ALL_STATUSES.forEach(({ status, item_type, metadata }) => {
    it(`${item_type}/${status} renders at least one action button`, () => {
      const item = makeItem({
        status: status as InboxItem['status'],
        item_type: item_type as InboxItem['item_type'],
        metadata: metadata || {},
      });
      render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      const actionButtons = buttons.filter(
        (b) => b.textContent !== '×' && !b.textContent?.includes('Close'),
      );
      expect(
        actionButtons.length,
        `${item_type}/${status} has no action buttons — dead end!`,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('agent_reviewing shows spinner message', () => {
    const item = makeItem({ status: 'agent_reviewing' });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/investigating/i).length).toBeGreaterThanOrEqual(1);
  });

  it('agent_cleared shows dismiss reason', () => {
    const item = makeItem({
      status: 'agent_cleared',
      metadata: { dismiss_reason: 'Expected behavior on ROSA clusters' },
    });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/Expected behavior/i).length).toBeGreaterThanOrEqual(1);
  });

  it('agent_cleared shows Restore to Inbox button', () => {
    const item = makeItem({
      status: 'agent_cleared',
      metadata: { dismiss_reason: 'No issue' },
    });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/Restore to Inbox/i).length).toBeGreaterThanOrEqual(1);
  });

  it('escalated shows View Finding button', () => {
    const item = makeItem({
      item_type: 'assessment',
      status: 'escalated',
      metadata: { escalated_to: 'inb-finding-123' },
    });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/View Finding/i).length).toBeGreaterThanOrEqual(1);
  });

  it('acknowledged finding shows Investigate with AI', () => {
    const item = makeItem({ status: 'acknowledged' });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/Investigate with AI/i).length).toBeGreaterThanOrEqual(1);
  });

  it('verifying shows both Resolved and Re-investigate', () => {
    const item = makeItem({ status: 'verifying' });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/Mark Resolved/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Re-investigate/i).length).toBeGreaterThanOrEqual(1);
  });

  it('in_progress task shows Mark Done', () => {
    const item = makeItem({ item_type: 'task', status: 'in_progress' });
    render(<TaskDetailDrawer item={item} onClose={vi.fn()} />);
    expect(screen.getAllByText(/Mark Done/i).length).toBeGreaterThanOrEqual(1);
  });
});
