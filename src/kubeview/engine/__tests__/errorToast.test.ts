import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showErrorToast } from '../errorToast';
import { PulseError } from '../errors';
import { useUIStore } from '../../store/uiStore';
import { useErrorStore } from '../../store/errorStore';

describe('showErrorToast', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [] });
  });

  it('shows enriched toast for PulseError', () => {
    const addToast = vi.fn();
    vi.spyOn(useUIStore, 'getState').mockReturnValue({
      ...useUIStore.getState(),
      addToast,
    });

    const err = new PulseError({
      message: 'pods is forbidden',
      category: 'permission',
      statusCode: 403,
      context: { operation: 'list', namespace: 'default' },
      userMessage: "You don't have permission to list Pod in default",
      suggestions: ['Check role bindings'],
    });

    showErrorToast(err, 'List Failed');

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'List Failed',
        category: 'permission',
        suggestions: ['Check role bindings'],
      }),
    );

    // Should also track the error
    expect(useErrorStore.getState().errors).toHaveLength(1);
    expect(useErrorStore.getState().errors[0].category).toBe('permission');
  });

  it('shows basic toast for plain Error', () => {
    const addToast = vi.fn();
    vi.spyOn(useUIStore, 'getState').mockReturnValue({
      ...useUIStore.getState(),
      addToast,
    });

    showErrorToast(new Error('something broke'), 'Operation Failed');

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Operation Failed',
        detail: 'something broke',
      }),
    );

    // Should NOT track in error store
    expect(useErrorStore.getState().errors).toHaveLength(0);
  });

  it('handles string errors', () => {
    const addToast = vi.fn();
    vi.spyOn(useUIStore, 'getState').mockReturnValue({
      ...useUIStore.getState(),
      addToast,
    });

    showErrorToast('oops');

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'An error occurred',
        detail: 'oops',
      }),
    );
  });
});
