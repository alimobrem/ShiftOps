// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
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

describe('customViewStore', () => {
  beforeEach(() => {
    useCustomViewStore.setState({ views: [] });
  });

  // ---- Initial state ----

  it('initializes with empty views', () => {
    expect(useCustomViewStore.getState().views).toEqual([]);
  });

  // ---- saveView ----

  it('saves a new view', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    const views = useCustomViewStore.getState().views;
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v1');
  });

  it('updates an existing view with same id', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'First' }));
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Updated' }));
    const views = useCustomViewStore.getState().views;
    expect(views).toHaveLength(1);
    expect(views[0].title).toBe('Updated');
  });

  it('enforces max 20 views', () => {
    for (let i = 0; i < 25; i++) {
      useCustomViewStore.getState().saveView(makeView({ id: `v${i}`, title: `View ${i}` }));
    }
    expect(useCustomViewStore.getState().views.length).toBeLessThanOrEqual(20);
  });

  // ---- deleteView ----

  it('deletes a view by id', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    useCustomViewStore.getState().saveView(makeView({ id: 'v2' }));
    useCustomViewStore.getState().deleteView('v1');
    const views = useCustomViewStore.getState().views;
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v2');
  });

  it('deleting non-existent id is a no-op', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1' }));
    useCustomViewStore.getState().deleteView('nonexistent');
    expect(useCustomViewStore.getState().views).toHaveLength(1);
  });

  // ---- updateView ----

  it('updates view fields by id', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Old' }));
    useCustomViewStore.getState().updateView('v1', { title: 'New', description: 'desc' });
    const view = useCustomViewStore.getState().views[0];
    expect(view.title).toBe('New');
    expect(view.description).toBe('desc');
  });

  it('updateView does nothing for non-existent id', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Same' }));
    useCustomViewStore.getState().updateView('nonexistent', { title: 'Changed' });
    expect(useCustomViewStore.getState().views[0].title).toBe('Same');
  });

  // ---- addWidget ----

  it('adds a widget to an existing view', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [] }));
    useCustomViewStore.getState().addWidget('v1', makeWidget('New Widget'));
    const layout = useCustomViewStore.getState().views[0].layout;
    expect(layout).toHaveLength(1);
    expect((layout[0] as any).title).toBe('New Widget');
  });

  it('addWidget does nothing for non-existent view', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [] }));
    useCustomViewStore.getState().addWidget('nonexistent', makeWidget());
    expect(useCustomViewStore.getState().views[0].layout).toHaveLength(0);
  });

  // ---- removeWidget ----

  it('removes a widget by index', () => {
    const w1 = makeWidget('A');
    const w2 = makeWidget('B');
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', layout: [w1, w2] }));
    useCustomViewStore.getState().removeWidget('v1', 0);
    const layout = useCustomViewStore.getState().views[0].layout;
    expect(layout).toHaveLength(1);
    expect((layout[0] as any).title).toBe('B');
  });

  // ---- getView ----

  it('getView returns the matching view', () => {
    useCustomViewStore.getState().saveView(makeView({ id: 'v1', title: 'Found' }));
    const view = useCustomViewStore.getState().getView('v1');
    expect(view?.title).toBe('Found');
  });

  it('getView returns undefined for missing id', () => {
    expect(useCustomViewStore.getState().getView('nope')).toBeUndefined();
  });

  // ---- Persist ----

  it('persists under openshiftpulse-custom-views key', () => {
    const persistOptions = (useCustomViewStore as any).persist;
    expect(persistOptions).toBeDefined();
    expect(persistOptions.getOptions().name).toBe('openshiftpulse-custom-views');
  });
});
