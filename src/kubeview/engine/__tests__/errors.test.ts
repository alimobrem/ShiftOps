import { describe, it, expect } from 'vitest';
import { PulseError, parseK8sErrorResponse, wrapNetworkError, classifyError } from '../errors';

function mockResponse(status: number, body: object): Response {
  return {
    ok: false,
    status,
    statusText: `Status ${status}`,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

const baseCtx = { operation: 'list', resourceKind: 'Pod', namespace: 'default' };

describe('parseK8sErrorResponse', () => {
  it('classifies 403 as permission error', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(403, { message: 'pods is forbidden', reason: 'Forbidden', code: 403 }),
      baseCtx,
    );
    expect(err).toBeInstanceOf(PulseError);
    expect(err.category).toBe('permission');
    expect(err.statusCode).toBe(403);
    expect(err.userMessage).toContain("don't have permission");
    expect(err.suggestions.length).toBeGreaterThan(0);
  });

  it('classifies 403 with quota as quota error', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(403, { message: 'exceeded quota', reason: 'Forbidden', code: 403 }),
      baseCtx,
    );
    expect(err.category).toBe('quota');
    expect(err.userMessage).toContain('quota exceeded');
  });

  it('classifies 404 as not_found', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(404, { message: 'pods "foo" not found', reason: 'NotFound', code: 404, details: { name: 'foo', kind: 'pods' } }),
      { operation: 'get', resourceKind: 'Pod', resourceName: 'foo', namespace: 'default' },
    );
    expect(err.category).toBe('not_found');
    expect(err.userMessage).toContain("'foo'");
  });

  it('classifies 409 as conflict', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(409, { message: 'the object has been modified', reason: 'Conflict', code: 409 }),
      baseCtx,
    );
    expect(err.category).toBe('conflict');
  });

  it('classifies 422 as validation with field causes', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(422, {
        message: 'Pod is invalid',
        reason: 'Invalid',
        code: 422,
        details: { causes: [{ field: 'spec.containers[0].image', message: 'Required value' }] },
      }),
      baseCtx,
    );
    expect(err.category).toBe('validation');
    expect(err.suggestions).toContain('spec.containers[0].image: Required value');
  });

  it('classifies 500+ as server error', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(500, { message: 'Internal error', reason: 'InternalError', code: 500 }),
      baseCtx,
    );
    expect(err.category).toBe('server');
  });

  it('classifies 401 as permission', async () => {
    const err = await parseK8sErrorResponse(
      mockResponse(401, { message: 'Unauthorized', reason: 'Unauthorized', code: 401 }),
      baseCtx,
    );
    expect(err.category).toBe('permission');
  });

  it('handles non-JSON response body', async () => {
    const response = {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not JSON')),
      headers: new Headers(),
    } as unknown as Response;
    const err = await parseK8sErrorResponse(response, baseCtx);
    expect(err.category).toBe('server');
    expect(err.statusCode).toBe(502);
  });
});

describe('wrapNetworkError', () => {
  it('wraps fetch errors as network category', () => {
    const err = wrapNetworkError(new TypeError('Failed to fetch'), baseCtx);
    expect(err.category).toBe('network');
    expect(err.statusCode).toBe(0);
    expect(err.userMessage).toContain('Cannot reach');
    expect(err.suggestions.length).toBeGreaterThan(0);
  });
});

describe('classifyError', () => {
  it('returns PulseError as-is', () => {
    const original = new PulseError({
      message: 'test', category: 'server', statusCode: 500,
      context: baseCtx, userMessage: 'test', suggestions: [],
    });
    expect(classifyError(original, baseCtx)).toBe(original);
  });

  it('wraps TypeError with fetch as network error', () => {
    const err = classifyError(new TypeError('Failed to fetch'), baseCtx);
    expect(err.category).toBe('network');
  });

  it('wraps generic errors as unknown', () => {
    const err = classifyError(new Error('something broke'), baseCtx);
    expect(err.category).toBe('unknown');
    expect(err.userMessage).toBe('something broke');
  });

  it('wraps string errors', () => {
    const err = classifyError('oops', baseCtx);
    expect(err.category).toBe('unknown');
    expect(err.message).toBe('oops');
  });
});

describe('PulseError', () => {
  it('extends Error and has all fields', () => {
    const err = new PulseError({
      message: 'raw msg', category: 'permission', statusCode: 403,
      k8sReason: 'Forbidden',
      context: { operation: 'delete', resourceKind: 'Pod', namespace: 'ns' },
      userMessage: 'No permission', suggestions: ['Ask admin'],
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PulseError');
    expect(err.id).toMatch(/^err-/);
    expect(err.timestamp).toBeGreaterThan(0);
    expect(err.k8sReason).toBe('Forbidden');
  });
});
