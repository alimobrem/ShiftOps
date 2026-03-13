import React, { useState, useCallback } from 'react';
import {
  PageSection, Title, Card, CardBody, Button, Label,
  Grid, GridItem, Alert,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useUIStore } from '@/store/useUIStore';

const BASE = '/api/kubernetes';

interface ClusterSnapshot {
  name: string;
  timestamp: string;
  clusterVersion?: Record<string, unknown>;
  infrastructure?: Record<string, unknown>;
  network?: Record<string, unknown>;
  ingress?: Record<string, unknown>;
  oauth?: Record<string, unknown>;
  scheduler?: Record<string, unknown>;
  proxy?: Record<string, unknown>;
  dns?: Record<string, unknown>;
  image?: Record<string, unknown>;
  clusterOperators: { name: string; version: string; available: boolean; degraded: boolean; progressing: boolean }[];
  crds: string[];
  nodes: { count: number; totalCPU: number; totalMemory: number; versions: string[] };
  storageClasses: string[];
}

interface ComparisonRow {
  field: string;
  left: string;
  right: string;
  isDifferent: boolean;
  category: string;
}

function extractVersion(cv: Record<string, unknown> | undefined): string {
  if (!cv) return '-';
  const status = (cv['status'] ?? {}) as Record<string, unknown>;
  const desired = (status['desired'] ?? {}) as Record<string, unknown>;
  return String(desired['version'] ?? '-');
}

function extractField(obj: Record<string, unknown> | undefined, ...path: string[]): string {
  if (!obj) return '-';
  let current: unknown = obj;
  for (const p of path) {
    if (current == null || typeof current !== 'object') return '-';
    current = (current as Record<string, unknown>)[p];
  }
  if (current == null) return '-';
  if (typeof current === 'object') return JSON.stringify(current);
  return String(current);
}

export default function ConfigCompare() {
  const addToast = useUIStore((s) => s.addToast);
  const [exporting, setExporting] = useState(false);
  const [leftSnapshot, setLeftSnapshot] = useState<ClusterSnapshot | null>(null);
  const [rightSnapshot, setRightSnapshot] = useState<ClusterSnapshot | null>(null);
  const [comparison, setComparison] = useState<ComparisonRow[] | null>(null);

  const exportSnapshot = useCallback(async () => {
    setExporting(true);
    const snapshot: ClusterSnapshot = {
      name: '',
      timestamp: new Date().toISOString(),
      clusterOperators: [],
      crds: [],
      nodes: { count: 0, totalCPU: 0, totalMemory: 0, versions: [] },
      storageClasses: [],
    };

    // Fetch config.openshift.io resources
    const configResources = [
      { key: 'clusterVersion', path: '/apis/config.openshift.io/v1/clusterversions/version' },
      { key: 'infrastructure', path: '/apis/config.openshift.io/v1/infrastructures/cluster' },
      { key: 'network', path: '/apis/config.openshift.io/v1/networks/cluster' },
      { key: 'ingress', path: '/apis/config.openshift.io/v1/ingresses/cluster' },
      { key: 'oauth', path: '/apis/config.openshift.io/v1/oauths/cluster' },
      { key: 'scheduler', path: '/apis/config.openshift.io/v1/schedulers/cluster' },
      { key: 'proxy', path: '/apis/config.openshift.io/v1/proxies/cluster' },
      { key: 'dns', path: '/apis/config.openshift.io/v1/dnses/cluster' },
      { key: 'image', path: '/apis/config.openshift.io/v1/images/cluster' },
    ];

    for (const cfg of configResources) {
      try {
        const res = await fetch(`${BASE}${cfg.path}`);
        if (res.ok) {
          (snapshot as unknown as Record<string, unknown>)[cfg.key] = await res.json();
        }
      } catch { /* ignore */ }
    }

    // Set snapshot name from cluster version
    const version = extractVersion(snapshot.clusterVersion);
    const platform = extractField(snapshot.infrastructure, 'status', 'platform');
    snapshot.name = `OpenShift ${version} (${platform})`;

    // Fetch ClusterOperators
    try {
      const res = await fetch(`${BASE}/apis/config.openshift.io/v1/clusteroperators`);
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        snapshot.clusterOperators = (data.items ?? []).map((co) => {
          const meta = (co['metadata'] ?? {}) as Record<string, unknown>;
          const status = (co['status'] ?? {}) as Record<string, unknown>;
          const conditions = (status['conditions'] ?? []) as Record<string, unknown>[];
          const versions = (status['versions'] ?? []) as Record<string, unknown>[];
          const operatorVersion = versions.find((v) => String(v['name']) === 'operator');
          return {
            name: String(meta['name'] ?? ''),
            version: String(operatorVersion?.['version'] ?? '-'),
            available: conditions.some((c) => String(c['type']) === 'Available' && String(c['status']) === 'True'),
            degraded: conditions.some((c) => String(c['type']) === 'Degraded' && String(c['status']) === 'True'),
            progressing: conditions.some((c) => String(c['type']) === 'Progressing' && String(c['status']) === 'True'),
          };
        });
      }
    } catch { /* ignore */ }

    // Fetch CRDs
    try {
      const res = await fetch(`${BASE}/apis/apiextensions.k8s.io/v1/customresourcedefinitions`);
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        snapshot.crds = (data.items ?? []).map((crd) => String(((crd['metadata'] ?? {}) as Record<string, unknown>)['name'] ?? '')).sort();
      }
    } catch { /* ignore */ }

    // Fetch Nodes summary
    try {
      const res = await fetch(`${BASE}/api/v1/nodes`);
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        const nodes = data.items ?? [];
        const versions = new Set<string>();
        let totalCPU = 0;
        let totalMem = 0;
        for (const node of nodes) {
          const status = (node['status'] ?? {}) as Record<string, unknown>;
          const capacity = (status['capacity'] ?? {}) as Record<string, string>;
          const nodeInfo = (status['nodeInfo'] ?? {}) as Record<string, string>;
          versions.add(nodeInfo['kubeletVersion'] ?? '-');
          const cpu = capacity['cpu'] ?? '0';
          totalCPU += cpu.endsWith('m') ? parseInt(cpu) / 1000 : parseInt(cpu);
          const mem = capacity['memory'] ?? '0';
          if (mem.endsWith('Ki')) totalMem += parseInt(mem) / (1024 * 1024);
          else if (mem.endsWith('Mi')) totalMem += parseInt(mem) / 1024;
          else if (mem.endsWith('Gi')) totalMem += parseInt(mem);
          else totalMem += parseInt(mem) / (1024 * 1024 * 1024);
        }
        snapshot.nodes = {
          count: nodes.length,
          totalCPU: Math.round(totalCPU),
          totalMemory: Math.round(totalMem),
          versions: Array.from(versions),
        };
      }
    } catch { /* ignore */ }

    // Fetch StorageClasses
    try {
      const res = await fetch(`${BASE}/apis/storage.k8s.io/v1/storageclasses`);
      if (res.ok) {
        const data = await res.json() as { items: Record<string, unknown>[] };
        snapshot.storageClasses = (data.items ?? []).map((sc) => String(((sc['metadata'] ?? {}) as Record<string, unknown>)['name'] ?? '')).sort();
      }
    } catch { /* ignore */ }

    // Download as JSON
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cluster-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
    addToast({ type: 'success', title: 'Snapshot exported', description: `${snapshot.name} saved` });
  }, [addToast]);

  const handleFileUpload = useCallback((side: 'left' | 'right') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const snapshot = JSON.parse(text) as ClusterSnapshot;
        if (!snapshot.timestamp || !snapshot.nodes) {
          addToast({ type: 'error', title: 'Invalid snapshot', description: 'File does not appear to be a cluster snapshot' });
          return;
        }
        if (side === 'left') setLeftSnapshot(snapshot);
        else setRightSnapshot(snapshot);
        addToast({ type: 'success', title: 'Snapshot loaded', description: snapshot.name || file.name });
      } catch {
        addToast({ type: 'error', title: 'Parse error', description: 'Could not parse JSON file' });
      }
    };
    input.click();
  }, [addToast]);

  const compareSnapshots = useCallback(() => {
    if (!leftSnapshot || !rightSnapshot) return;
    const rows: ComparisonRow[] = [];

    function addRow(category: string, field: string, left: string, right: string) {
      rows.push({ category, field, left, right, isDifferent: left !== right });
    }

    // Version
    addRow('Version', 'OpenShift Version', extractVersion(leftSnapshot.clusterVersion), extractVersion(rightSnapshot.clusterVersion));
    addRow('Version', 'K8s Versions', leftSnapshot.nodes.versions.join(', '), rightSnapshot.nodes.versions.join(', '));

    // Infrastructure
    addRow('Infrastructure', 'Platform', extractField(leftSnapshot.infrastructure, 'status', 'platform'), extractField(rightSnapshot.infrastructure, 'status', 'platform'));
    addRow('Infrastructure', 'API Server URL', extractField(leftSnapshot.infrastructure, 'status', 'apiServerURL'), extractField(rightSnapshot.infrastructure, 'status', 'apiServerURL'));

    // Network
    addRow('Network', 'Network Type', extractField(leftSnapshot.network, 'spec', 'networkType'), extractField(rightSnapshot.network, 'spec', 'networkType'));
    addRow('Network', 'Cluster Network CIDR', extractField(leftSnapshot.network, 'spec', 'clusterNetwork'), extractField(rightSnapshot.network, 'spec', 'clusterNetwork'));
    addRow('Network', 'Service Network', extractField(leftSnapshot.network, 'spec', 'serviceNetwork'), extractField(rightSnapshot.network, 'spec', 'serviceNetwork'));

    // Ingress
    addRow('Ingress', 'Domain', extractField(leftSnapshot.ingress, 'spec', 'domain'), extractField(rightSnapshot.ingress, 'spec', 'domain'));

    // Capacity
    addRow('Capacity', 'Node Count', String(leftSnapshot.nodes.count), String(rightSnapshot.nodes.count));
    addRow('Capacity', 'Total CPU (cores)', String(leftSnapshot.nodes.totalCPU), String(rightSnapshot.nodes.totalCPU));
    addRow('Capacity', 'Total Memory (Gi)', String(leftSnapshot.nodes.totalMemory), String(rightSnapshot.nodes.totalMemory));

    // Storage Classes
    addRow('Storage', 'Storage Classes', leftSnapshot.storageClasses.join(', '), rightSnapshot.storageClasses.join(', '));

    // Operators - version comparison
    const allOperators = new Set([
      ...leftSnapshot.clusterOperators.map((o) => o.name),
      ...rightSnapshot.clusterOperators.map((o) => o.name),
    ]);
    for (const opName of Array.from(allOperators).sort()) {
      const leftOp = leftSnapshot.clusterOperators.find((o) => o.name === opName);
      const rightOp = rightSnapshot.clusterOperators.find((o) => o.name === opName);
      addRow('Operators', opName, leftOp ? leftOp.version : '(not installed)', rightOp ? rightOp.version : '(not installed)');
    }

    // CRDs diff
    const leftCrds = new Set(leftSnapshot.crds);
    const rightCrds = new Set(rightSnapshot.crds);
    const onlyLeft = leftSnapshot.crds.filter((c) => !rightCrds.has(c));
    const onlyRight = rightSnapshot.crds.filter((c) => !leftCrds.has(c));
    if (onlyLeft.length > 0 || onlyRight.length > 0) {
      addRow('CRDs', 'Total CRDs', String(leftSnapshot.crds.length), String(rightSnapshot.crds.length));
      for (const crd of onlyLeft.slice(0, 20)) {
        addRow('CRDs', crd, 'Installed', '(not installed)');
      }
      for (const crd of onlyRight.slice(0, 20)) {
        addRow('CRDs', crd, '(not installed)', 'Installed');
      }
    }

    setComparison(rows);
  }, [leftSnapshot, rightSnapshot]);

  // Group comparison by category
  const comparisonGroups = comparison ? Array.from(
    comparison.reduce((map, row) => {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
      return map;
    }, new Map<string, ComparisonRow[]>())
  ) : [];

  const diffCount = comparison?.filter((r) => r.isDifferent).length ?? 0;

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">Config Compare</Title>
        <p className="os-text-muted">Compare cluster configurations — versions, operators, CRDs, capacity, and settings</p>
      </PageSection>

      <PageSection>
        <Card style={{ marginBottom: 24 }}>
          <CardBody>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: 12 }}>Step 1: Export or Upload Snapshots</Title>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" onClick={exportSnapshot} isLoading={exporting}>
                Export Current Cluster
              </Button>
              <span className="os-text-muted">or</span>
              <Button variant="secondary" onClick={() => handleFileUpload('left')}>
                Upload Snapshot A {leftSnapshot && <Label color="green" isCompact style={{ marginLeft: 6 }}>{leftSnapshot.name}</Label>}
              </Button>
              <Button variant="secondary" onClick={() => handleFileUpload('right')}>
                Upload Snapshot B {rightSnapshot && <Label color="blue" isCompact style={{ marginLeft: 6 }}>{rightSnapshot.name}</Label>}
              </Button>
            </div>
          </CardBody>
        </Card>

        {leftSnapshot && rightSnapshot && (
          <Card style={{ marginBottom: 24 }}>
            <CardBody>
              <Title headingLevel="h3" size="lg" style={{ marginBottom: 12 }}>Step 2: Compare</Title>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Button variant="primary" onClick={compareSnapshots}>Compare Snapshots</Button>
                <span className="os-text-muted">
                  A: {leftSnapshot.name} ({new Date(leftSnapshot.timestamp).toLocaleDateString()}) vs
                  B: {rightSnapshot.name} ({new Date(rightSnapshot.timestamp).toLocaleDateString()})
                </span>
              </div>
            </CardBody>
          </Card>
        )}

        {comparison && (
          <>
            <Alert
              variant={diffCount > 0 ? 'warning' : 'success'}
              isInline
              title={diffCount > 0 ? `${diffCount} differences found` : 'Clusters are identical in compared fields'}
              style={{ marginBottom: 16 }}
            />

            {comparisonGroups.map(([category, rows]) => {
              const hasDiffs = rows.some((r) => r.isDifferent);
              return (
                <Card key={category} style={{ marginBottom: 16 }}>
                  <CardBody>
                    <Title headingLevel="h4" size="md" style={{ marginBottom: 8 }}>
                      {category}
                      {hasDiffs && <Label color="orange" isCompact style={{ marginLeft: 8 }}>{rows.filter((r) => r.isDifferent).length} diff</Label>}
                    </Title>
                    <Table aria-label={`${category} comparison`} variant="compact">
                      <Thead>
                        <Tr>
                          <Th width={30}>Field</Th>
                          <Th width={35}>Snapshot A</Th>
                          <Th width={35}>Snapshot B</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {rows.map((row) => (
                          <Tr key={row.field} style={row.isDifferent ? { background: 'rgba(240, 171, 0, 0.08)' } : {}}>
                            <Td dataLabel="Field">
                              <strong>{row.field}</strong>
                              {row.isDifferent && <Label color="orange" isCompact style={{ marginLeft: 6 }}>differs</Label>}
                            </Td>
                            <Td dataLabel="Snapshot A"><code style={{ fontSize: 12 }}>{row.left}</code></Td>
                            <Td dataLabel="Snapshot B"><code style={{ fontSize: 12 }}>{row.right}</code></Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </CardBody>
                </Card>
              );
            })}
          </>
        )}
      </PageSection>
    </>
  );
}
