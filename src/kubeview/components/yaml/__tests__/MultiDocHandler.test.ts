import { describe, it, expect } from 'vitest';

// Extract the parsing logic from MultiDocHandler
function parseMultiDocYaml(yaml: string) {
  const documents = yaml.split(/^---$/m).filter(doc => doc.trim());
  const parsed: Array<{ raw: string; kind: string; name: string; namespace?: string }> = [];

  for (const doc of documents) {
    const trimmed = doc.trim();
    if (!trimmed) continue;

    const kindMatch = trimmed.match(/^kind:\s*(.+)$/m);
    if (!kindMatch) continue;

    const kind = kindMatch[1].trim();
    const nameMatch = trimmed.match(/^metadata:\s*\n\s+name:\s*(.+)$/m);
    const name = nameMatch?.[1].trim() || 'unknown';
    const namespaceMatch = trimmed.match(/^metadata:\s*\n(?:.*\n)*?\s+namespace:\s*(.+)$/m);
    const namespace = namespaceMatch?.[1].trim();

    parsed.push({ raw: trimmed, kind, name, namespace });
  }

  return parsed;
}

describe('parseMultiDocYaml', () => {
  it('parses a single document', () => {
    const yaml = `apiVersion: v1
kind: Pod
metadata:
  name: nginx
  namespace: default`;

    const result = parseMultiDocYaml(yaml);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('Pod');
    expect(result[0].name).toBe('nginx');
    expect(result[0].namespace).toBe('default');
  });

  it('parses multiple documents separated by ---', () => {
    const yaml = `apiVersion: v1
kind: Service
metadata:
  name: my-svc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deploy`;

    const result = parseMultiDocYaml(yaml);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('Service');
    expect(result[0].name).toBe('my-svc');
    expect(result[1].kind).toBe('Deployment');
    expect(result[1].name).toBe('my-deploy');
  });

  it('skips documents without kind', () => {
    const yaml = `# just a comment
some: value
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config`;

    const result = parseMultiDocYaml(yaml);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('ConfigMap');
  });

  it('handles leading --- separator', () => {
    const yaml = `---
apiVersion: v1
kind: Secret
metadata:
  name: my-secret`;

    const result = parseMultiDocYaml(yaml);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('Secret');
  });

  it('returns empty for empty input', () => {
    expect(parseMultiDocYaml('')).toHaveLength(0);
    expect(parseMultiDocYaml('   ')).toHaveLength(0);
  });

  it('returns empty for yaml without kind', () => {
    const yaml = `apiVersion: v1
metadata:
  name: test`;

    expect(parseMultiDocYaml(yaml)).toHaveLength(0);
  });

  it('defaults name to unknown when missing', () => {
    const yaml = `apiVersion: v1
kind: Namespace`;

    const result = parseMultiDocYaml(yaml);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('unknown');
  });

  it('handles namespace-less resources', () => {
    const yaml = `apiVersion: v1
kind: Node
metadata:
  name: worker-1`;

    const result = parseMultiDocYaml(yaml);
    expect(result[0].namespace).toBeUndefined();
  });
});
