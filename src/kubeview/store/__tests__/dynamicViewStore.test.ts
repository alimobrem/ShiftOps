// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useDynamicViewStore } from '../dynamicViewStore';
import type { ViewSpec } from '../../engine/agentComponents';

function makeView(id: string, generatedAt = Date.now()): ViewSpec {
  return {
    id,
    title: `View ${id}`,
    description: `Description for ${id}`,
    layout: [{ kind: 'key_value', pairs: [{ key: 'k', value: 'v' }] }],
    generatedAt,
  };
}

describe('dynamicViewStore', () => {
  beforeEach(() => {
    useDynamicViewStore.setState({ views: [] });
  });

  it('saves a view', () => {
    const view = makeView('v1');
    useDynamicViewStore.getState().saveView(view);
    expect(useDynamicViewStore.getState().views).toHaveLength(1);
    expect(useDynamicViewStore.getState().views[0].id).toBe('v1');
  });

  it('gets a view by ID', () => {
    const view = makeView('v2');
    useDynamicViewStore.getState().saveView(view);
    const found = useDynamicViewStore.getState().getView('v2');
    expect(found).toBeTruthy();
    expect(found!.title).toBe('View v2');
  });

  it('returns undefined for missing ID', () => {
    expect(useDynamicViewStore.getState().getView('missing')).toBeUndefined();
  });

  it('deletes a view', () => {
    useDynamicViewStore.getState().saveView(makeView('v3'));
    useDynamicViewStore.getState().deleteView('v3');
    expect(useDynamicViewStore.getState().views).toHaveLength(0);
  });

  it('trims to MAX_VIEWS when saving beyond limit', () => {
    // Save 21 views — oldest should be trimmed
    for (let i = 0; i < 21; i++) {
      useDynamicViewStore.getState().saveView(makeView(`v${i}`, 1000 + i));
    }
    const { views } = useDynamicViewStore.getState();
    expect(views).toHaveLength(20);
    // The oldest (v0, generatedAt=1000) should have been trimmed
    expect(views.find((v) => v.id === 'v0')).toBeUndefined();
    // The newest (v20) should exist
    expect(views.find((v) => v.id === 'v20')).toBeTruthy();
  });
});
