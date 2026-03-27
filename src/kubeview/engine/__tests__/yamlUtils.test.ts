import { describe, it, expect } from 'vitest';
import { jsonToYaml } from '../yamlUtils';

describe('jsonToYaml', () => {
  it('serializes simple key-value pairs', () => {
    expect(jsonToYaml({ name: 'test', count: 3 })).toBe('name: test\ncount: 3');
  });

  it('serializes nested objects', () => {
    const result = jsonToYaml({ metadata: { name: 'foo', namespace: 'bar' } });
    expect(result).toBe('metadata:\n  name: foo\n  namespace: bar');
  });

  it('serializes simple arrays', () => {
    const result = jsonToYaml({ items: ['a', 'b', 'c'] });
    expect(result).toBe('items:\n  - a\n  - b\n  - c');
  });

  it('serializes arrays of objects with nested arrays (RBAC rules)', () => {
    const role = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: { name: 'test-role' },
      rules: [
        { verbs: ['get', 'list'], apiGroups: [''], resources: ['configmaps'] },
      ],
    };
    const result = jsonToYaml(role);

    // verbs should be on a new line, not inline
    expect(result).toContain('- verbs:\n');
    expect(result).not.toContain('- verbs:       -');

    // nested array items should be indented
    expect(result).toContain('      - get');
    expect(result).toContain('      - list');
    expect(result).toContain('    apiGroups:');
    expect(result).toContain('    resources:');
  });

  it('serializes empty arrays and objects', () => {
    expect(jsonToYaml({ items: [], meta: {} })).toBe('items: []\nmeta: {}');
  });

  it('quotes strings that need quoting', () => {
    expect(jsonToYaml({ key: '' })).toBe('key: ""');
    expect(jsonToYaml({ key: 'true' })).toBe('key: "true"');
    expect(jsonToYaml({ key: '8080' })).toBe('key: "8080"');
    expect(jsonToYaml({ key: 'has: colon' })).toBe('key: "has: colon"');
  });

  it('handles null and boolean values', () => {
    expect(jsonToYaml({ a: null, b: true, c: false })).toBe('a: null\nb: true\nc: false');
  });
});
