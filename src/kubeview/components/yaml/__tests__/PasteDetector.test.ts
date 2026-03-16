import { describe, it, expect } from 'vitest';

// Extract detection logic from PasteDetector
function detectK8sResource(text: string) {
  const trimmed = text.trim();

  const apiVersionMatch = trimmed.match(/^apiVersion:\s*(.+)$/m);
  const kindMatch = trimmed.match(/^kind:\s*(.+)$/m);

  if (!apiVersionMatch || !kindMatch) return null;

  const apiVersion = apiVersionMatch[1].trim();
  const kind = kindMatch[1].trim();

  const nameMatch = trimmed.match(/^metadata:\s*\n\s+name:\s*(.+)$/m);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();

  const namespaceMatch = trimmed.match(/^metadata:\s*\n(?:.*\n)*?\s+namespace:\s*(.+)$/m);
  const namespace = namespaceMatch?.[1].trim();

  const isMultiDoc = /^---$/m.test(trimmed);
  const docCount = isMultiDoc ? trimmed.split(/^---$/m).filter(doc => doc.trim()).length : 1;

  return { kind, apiVersion, name, namespace, raw: trimmed, isMultiDoc, docCount };
}

describe('detectK8sResource', () => {
  it('detects a valid K8s resource', () => {
    const yaml = `apiVersion: v1
kind: Pod
metadata:
  name: nginx
  namespace: default`;

    const result = detectK8sResource(yaml);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('Pod');
    expect(result!.apiVersion).toBe('v1');
    expect(result!.name).toBe('nginx');
    expect(result!.namespace).toBe('default');
    expect(result!.isMultiDoc).toBe(false);
    expect(result!.docCount).toBe(1);
  });

  it('detects grouped apiVersion', () => {
    const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app`;

    const result = detectK8sResource(yaml);
    expect(result!.apiVersion).toBe('apps/v1');
    expect(result!.kind).toBe('Deployment');
  });

  it('detects multi-document YAML', () => {
    const yaml = `apiVersion: v1
kind: Service
metadata:
  name: svc
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm`;

    const result = detectK8sResource(yaml);
    expect(result!.isMultiDoc).toBe(true);
    expect(result!.docCount).toBe(2);
  });

  it('returns null for non-K8s text', () => {
    expect(detectK8sResource('hello world')).toBeNull();
    expect(detectK8sResource('{"json": true}')).toBeNull();
    expect(detectK8sResource('')).toBeNull();
  });

  it('returns null for missing apiVersion', () => {
    const yaml = `kind: Pod
metadata:
  name: test`;
    expect(detectK8sResource(yaml)).toBeNull();
  });

  it('returns null for missing kind', () => {
    const yaml = `apiVersion: v1
metadata:
  name: test`;
    expect(detectK8sResource(yaml)).toBeNull();
  });

  it('returns null for missing metadata.name', () => {
    const yaml = `apiVersion: v1
kind: Pod`;
    expect(detectK8sResource(yaml)).toBeNull();
  });

  it('handles namespace-less resources', () => {
    const yaml = `apiVersion: v1
kind: Node
metadata:
  name: worker-1`;

    const result = detectK8sResource(yaml);
    expect(result!.namespace).toBeUndefined();
  });

  it('trims whitespace', () => {
    const yaml = `
    apiVersion: v1
kind: ConfigMap
metadata:
  name: test
    `;

    const result = detectK8sResource(yaml);
    expect(result!.kind).toBe('ConfigMap');
    expect(result!.name).toBe('test');
  });
});
