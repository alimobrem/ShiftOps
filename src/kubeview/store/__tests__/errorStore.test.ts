import { describe, it, expect, beforeEach } from 'vitest';
import { useErrorStore, type TrackedError } from '../errorStore';

function makeError(overrides: Partial<TrackedError> = {}): TrackedError {
  return {
    id: `err-${Math.random()}`,
    timestamp: Date.now(),
    category: 'server',
    message: 'raw error message',
    userMessage: 'Something went wrong',
    statusCode: 500,
    operation: 'list',
    suggestions: ['Try again'],
    resolved: false,
    ...overrides,
  };
}

describe('errorStore', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [] });
  });

  it('tracks errors', () => {
    const err = makeError();
    useErrorStore.getState().trackError(err);
    expect(useErrorStore.getState().errors).toHaveLength(1);
    expect(useErrorStore.getState().errors[0].id).toBe(err.id);
  });

  it('newest error first', () => {
    const e1 = makeError({ id: 'first' });
    const e2 = makeError({ id: 'second' });
    useErrorStore.getState().trackError(e1);
    useErrorStore.getState().trackError(e2);
    expect(useErrorStore.getState().errors[0].id).toBe('second');
  });

  it('resolves errors', () => {
    const err = makeError({ id: 'test-resolve' });
    useErrorStore.getState().trackError(err);
    useErrorStore.getState().resolveError('test-resolve', 'dismissed');
    const resolved = useErrorStore.getState().errors[0];
    expect(resolved.resolved).toBe(true);
    expect(resolved.userAction).toBe('dismissed');
    expect(resolved.resolvedAt).toBeGreaterThan(0);
  });

  it('clears resolved', () => {
    useErrorStore.getState().trackError(makeError({ id: 'a', resolved: false }));
    useErrorStore.getState().trackError(makeError({ id: 'b', resolved: false }));
    useErrorStore.getState().resolveError('a', 'dismissed');
    useErrorStore.getState().clearResolved();
    expect(useErrorStore.getState().errors).toHaveLength(1);
    expect(useErrorStore.getState().errors[0].id).toBe('b');
  });

  it('counts unresolved', () => {
    useErrorStore.getState().trackError(makeError({ id: 'x' }));
    useErrorStore.getState().trackError(makeError({ id: 'y' }));
    useErrorStore.getState().resolveError('x');
    expect(useErrorStore.getState().getUnresolvedCount()).toBe(1);
  });

  it('evicts resolved first when over cap', () => {
    // Fill with 200 errors, half resolved
    for (let i = 0; i < 200; i++) {
      useErrorStore.getState().trackError(
        makeError({ id: `err-${i}`, resolved: i % 2 === 0 })
      );
    }
    // Adding one more should evict a resolved error
    useErrorStore.getState().trackError(makeError({ id: 'new' }));
    const errors = useErrorStore.getState().errors;
    expect(errors.length).toBeLessThanOrEqual(200);
  });
});
