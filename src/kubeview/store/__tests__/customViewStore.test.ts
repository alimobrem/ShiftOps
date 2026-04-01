// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCustomViewStore } from '../customViewStore';
import type { ViewSpec, ComponentSpec } from '../../engine/agentComponents';

function makeView(overrides: Partial<ViewSpec> = {}): ViewSpec {
  return {
    id: overrides.id ?? 'v1',
    title: overrides.title ?? 'Test View',
    layout: overrides.layout ?? [],
    generatedAt: overrides.generatedAt ?? Date.now(),
    ...overrides,
  };
}

function makeWidget(title = 'Widget'): ComponentSpec {
  return {
    kind: 'key_value',
    title,
    pairs: [{ key: 'status', value: 'ok' }],
  };
}

/** Mock fetch to simulate the backend API */
function mockFetch(response: any = {}, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    json: () => Promise.resolve(response),
    statusText: 'OK',
  } as Response);
}

describe('customViewStore', () => {
  beforeEach(() => {
    useCustomViewStore.setState({ views: [], loading: false, currentUser: null });
    vi.restoreAllMocks();
  });

  // ---- Initial state ----

  it('initializes with empty views', () => {
    expect(useCustomViewStore.getState().views).toEqual([]);
  });

  // ---- saveView ----

  it('saves a new view', async () => {
    const fetchSpy = mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    const views = useCustomViewStore.getState().views;
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v1');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/agent/views',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ---- deleteView ----

  it('deletes a view by id', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    await useCustomViewStore.getState().saveView(makeView({ id: 'v2' }));

    mockFetch({ deleted: true });
    await useCustomViewStore.getState().deleteView('v1');
    const views = useCustomViewStore.getState().views;
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v2');
  });

  it('deleting non-existent id removes nothing from local state', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));

    mockFetch({ deleted: true });
    await useCustomViewStore.getState().deleteView('nonexistent');
    expect(useCustomViewStore.getState().views).toHaveLength(1);
  });

  // ---- updateView ----

  it('updates view fields by id', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Old' }));

    mockFetch({ updated: true });
    await useCustomViewStore.getState().updateView('v1', { title: 'New', description: 'desc' });
    const view = useCustomViewStore.getState().views[0];
    expect(view.title).toBe('New');
    expect(view.description).toBe('desc');
  });

  it('updateView does nothing for non-existent id', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Same' }));

    mockFetch({ updated: true });
    await useCustomViewStore.getState().updateView('nonexistent', { title: 'Changed' });
    expect(useCustomViewStore.getState().views[0].title).toBe('Same');
  });

  // ---- addWidget ----

  it('adds a widget to an existing view', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [] }));

    mockFetch({ updated: true });
    await useCustomViewStore.getState().addWidget('v1', makeWidget('New Widget'));
    const layout = useCustomViewStore.getState().views[0].layout;
    expect(layout).toHaveLength(1);
    expect((layout[0] as any).title).toBe('New Widget');
  });

  it('addWidget does nothing for non-existent view', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [] }));

    await useCustomViewStore.getState().addWidget('nonexistent', makeWidget());
    expect(useCustomViewStore.getState().views[0].layout).toHaveLength(0);
  });

  // ---- removeWidget ----

  it('removes a widget by index', async () => {
    const w1 = makeWidget('A');
    const w2 = makeWidget('B');
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [w1, w2] }));

    mockFetch({ updated: true });
    await useCustomViewStore.getState().removeWidget('v1', 0);
    const layout = useCustomViewStore.getState().views[0].layout;
    expect(layout).toHaveLength(1);
    expect((layout[0] as any).title).toBe('B');
  });

  // ---- getView ----

  it('getView returns the matching view', async () => {
    mockFetch({ id: 'v1', owner: 'testuser' });
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Found' }));
    const view = useCustomViewStore.getState().getView('v1');
    expect(view?.title).toBe('Found');
  });

  it('getView returns undefined for missing id', () => {
    expect(useCustomViewStore.getState().getView('nope')).toBeUndefined();
  });

  // ---- loadViews ----

  it('loads views from the backend API', async () => {
    const fetchSpy = mockFetch({
      views: [
        { id: 'v1', title: 'Loaded', description: '', icon: '', layout: [], positions: {}, created_at: new Date().toISOString(), owner: 'testuser' },
      ],
      owner: 'testuser',
    });
    await useCustomViewStore.getState().loadViews();
    expect(useCustomViewStore.getState().views).toHaveLength(1);
    expect(useCustomViewStore.getState().views[0].title).toBe('Loaded');
    expect(useCustomViewStore.getState().currentUser).toBe('testuser');
    expect(fetchSpy).toHaveBeenCalledWith('/api/agent/views', expect.anything());
  });

  // ---- Error handling ----

  it('handles API errors gracefully on save', async () => {
    mockFetch({ error: 'Server error' }, false);
    await useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    expect(useCustomViewStore.getState().views).toHaveLength(0);
  });
});
