// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// Mock react-router-dom's useBlocker
const blockerMock = { state: 'unblocked' as string, proceed: vi.fn(), reset: vi.fn() };
vi.mock('react-router-dom', () => ({
  useBlocker: (condition: boolean) => {
    blockerMock._condition = condition;
    return blockerMock;
  },
}));

// Extend mock type for internal tracking
declare module 'react-router-dom' {
  interface Blocker {
    _condition?: boolean;
  }
}

import { useUnsavedChanges } from '../useUnsavedChanges';

describe('useUnsavedChanges', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>;
  let removeEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    blockerMock.state = 'unblocked';
    addEventSpy = vi.spyOn(window, 'addEventListener');
    removeEventSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    cleanup();
    addEventSpy.mockRestore();
    removeEventSpy.mockRestore();
  });

  it('does not add beforeunload listener when hasChanges is false', () => {
    renderHook(() => useUnsavedChanges(false));
    const beforeunloadCalls = addEventSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    expect(beforeunloadCalls.length).toBe(0);
  });

  it('adds beforeunload listener when hasChanges is true', () => {
    renderHook(() => useUnsavedChanges(true));
    const beforeunloadCalls = addEventSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    expect(beforeunloadCalls.length).toBe(1);
  });

  it('removes beforeunload listener on cleanup', () => {
    const { unmount } = renderHook(() => useUnsavedChanges(true));
    unmount();
    const removeCalls = removeEventSpy.mock.calls.filter(([type]) => type === 'beforeunload');
    expect(removeCalls.length).toBe(1);
  });

  it('shows confirm dialog when blocker is blocked', () => {
    const { result, rerender } = renderHook(() => useUnsavedChanges(true));

    expect(result.current.showConfirm).toBe(false);

    // Simulate blocker activation
    blockerMock.state = 'blocked';
    rerender();

    expect(result.current.showConfirm).toBe(true);
  });

  it('confirmNavigation calls blocker.proceed and hides dialog', () => {
    blockerMock.state = 'blocked';
    const { result } = renderHook(() => useUnsavedChanges(true));

    // showConfirm is set via useEffect
    expect(result.current.showConfirm).toBe(true);

    act(() => result.current.confirmNavigation());

    expect(blockerMock.proceed).toHaveBeenCalled();
    expect(result.current.showConfirm).toBe(false);
  });

  it('cancelNavigation calls blocker.reset and hides dialog', () => {
    blockerMock.state = 'blocked';
    const { result } = renderHook(() => useUnsavedChanges(true));

    act(() => result.current.cancelNavigation());

    expect(blockerMock.reset).toHaveBeenCalled();
    expect(result.current.showConfirm).toBe(false);
  });

  it('passes hasChanges condition to useBlocker', () => {
    renderHook(() => useUnsavedChanges(true));
    expect(blockerMock._condition).toBe(true);

    renderHook(() => useUnsavedChanges(false));
    expect(blockerMock._condition).toBe(false);
  });
});
