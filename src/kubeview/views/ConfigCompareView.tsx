import React, { useState, useCallback } from 'react';
import { Download, Upload, GitCompare, Loader2, CheckCircle, XCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '../store/uiStore';

const BASE = '/api/kubernetes';

interface ClusterSnapshot {
  timestamp: string;
  clusterVersion: string;
  platform: string;
  nodes: { count: number; versions: string[] };
  clusterOperators: Array<{ name: string; version: string; available: boolean; degraded: boolean }>;
  crds: string[];
  storageClasses: string[];
  namespaceCount: number;
}

interface DiffRow {
  field: string;
  category: string;
  left: string;
  right: string;
  changed: boolean;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function captureSnapshot(): Promise<ClusterSnapshot> {
  const snapshot: ClusterSnapshot = {
    timestamp: new Date().toISOString(),
    clusterVersion: '',
    platform: '',
    nodes: { count: 0, versions: [] },
    clusterOperators: [],
    crds: [],
    storageClasses: [],
    namespaceCount: 0,
  };

  // Cluster version
  const cv = await fetchJson<any>('/apis/config.openshift.io/v1/clusterversions/version');
  if (cv) {
    snapshot.clusterVersion = cv.status?.desired?.version || cv.status?.history?.[0]?.version || '';
  }

  // Infrastructure
  const infra = await fetchJson<any>('/apis/config.openshift.io/v1/infrastructures/cluster');
  if (infra) {
    snapshot.platform = infra.status?.platform || infra.status?.platformStatus?.type || '';
  }

  // Nodes
  const nodesData = await fetchJson<any>('/api/v1/nodes');
  if (nodesData?.items) {
    snapshot.nodes.count = nodesData.items.length;
    const versions = new Set<string>();
    for (const n of nodesData.items) {
      versions.add(n.status?.nodeInfo?.kubeletVersion || '');
    }
    snapshot.nodes.versions = [...versions].filter(Boolean).sort();
  }

  // ClusterOperators
  const coData = await fetchJson<any>('/apis/config.openshift.io/v1/clusteroperators');
  if (coData?.items) {
    snapshot.clusterOperators = coData.items.map((co: any) => ({
      name: co.metadata.name,
      version: co.status?.versions?.find((v: any) => v.name === 'operator')?.version || '',
      available: co.status?.conditions?.find((c: any) => c.type === 'Available')?.status === 'True',
      degraded: co.status?.conditions?.find((c: any) => c.type === 'Degraded')?.status === 'True',
    }));
  }

  // CRDs
  const crdData = await fetchJson<any>('/apis/apiextensions.k8s.io/v1/customresourcedefinitions');
  if (crdData?.items) {
    snapshot.crds = crdData.items.map((c: any) => c.metadata.name).sort();
  }

  // StorageClasses
  const scData = await fetchJson<any>('/apis/storage.k8s.io/v1/storageclasses');
  if (scData?.items) {
    snapshot.storageClasses = scData.items.map((s: any) => s.metadata.name).sort();
  }

  // Namespaces
  const nsData = await fetchJson<any>('/api/v1/namespaces');
  if (nsData?.items) {
    snapshot.namespaceCount = nsData.items.length;
  }

  return snapshot;
}

function compareSnapshots(left: ClusterSnapshot, right: ClusterSnapshot): DiffRow[] {
  const rows: DiffRow[] = [];

  rows.push({ field: 'Cluster Version', category: 'Cluster', left: left.clusterVersion, right: right.clusterVersion, changed: left.clusterVersion !== right.clusterVersion });
  rows.push({ field: 'Platform', category: 'Cluster', left: left.platform, right: right.platform, changed: left.platform !== right.platform });
  rows.push({ field: 'Node Count', category: 'Nodes', left: String(left.nodes.count), right: String(right.nodes.count), changed: left.nodes.count !== right.nodes.count });
  rows.push({ field: 'Kubelet Versions', category: 'Nodes', left: left.nodes.versions.join(', '), right: right.nodes.versions.join(', '), changed: left.nodes.versions.join(',') !== right.nodes.versions.join(',') });
  rows.push({ field: 'Namespace Count', category: 'Cluster', left: String(left.namespaceCount), right: String(right.namespaceCount), changed: left.namespaceCount !== right.namespaceCount });
  rows.push({ field: 'CRD Count', category: 'APIs', left: String(left.crds.length), right: String(right.crds.length), changed: left.crds.length !== right.crds.length });
  rows.push({ field: 'Storage Classes', category: 'Storage', left: left.storageClasses.join(', '), right: right.storageClasses.join(', '), changed: left.storageClasses.join(',') !== right.storageClasses.join(',') });

  // Added/removed CRDs
  const leftCrds = new Set(left.crds);
  const rightCrds = new Set(right.crds);
  const addedCrds = right.crds.filter(c => !leftCrds.has(c));
  const removedCrds = left.crds.filter(c => !rightCrds.has(c));
  if (addedCrds.length > 0) rows.push({ field: 'CRDs Added', category: 'APIs', left: '', right: addedCrds.join(', '), changed: true });
  if (removedCrds.length > 0) rows.push({ field: 'CRDs Removed', category: 'APIs', left: removedCrds.join(', '), right: '', changed: true });

  // ClusterOperator changes
  const leftOps = new Map(left.clusterOperators.map(o => [o.name, o]));
  const rightOps = new Map(right.clusterOperators.map(o => [o.name, o]));
  for (const [name, rOp] of rightOps) {
    const lOp = leftOps.get(name);
    if (!lOp) {
      rows.push({ field: `Operator: ${name}`, category: 'Operators', left: '(not present)', right: `v${rOp.version}`, changed: true });
    } else if (lOp.version !== rOp.version) {
      rows.push({ field: `Operator: ${name}`, category: 'Operators', left: `v${lOp.version}`, right: `v${rOp.version}`, changed: true });
    } else if (lOp.available !== rOp.available || lOp.degraded !== rOp.degraded) {
      rows.push({ field: `Operator: ${name}`, category: 'Operators', left: `${lOp.available ? 'Available' : 'Unavailable'}${lOp.degraded ? ' Degraded' : ''}`, right: `${rOp.available ? 'Available' : 'Unavailable'}${rOp.degraded ? ' Degraded' : ''}`, changed: true });
    }
  }

  return rows;
}

export default function ConfigCompareView() {
  const addToast = useUIStore((s) => s.addToast);
  const [exporting, setExporting] = useState(false);
  const [leftSnapshot, setLeftSnapshot] = useState<ClusterSnapshot | null>(null);
  const [rightSnapshot, setRightSnapshot] = useState<ClusterSnapshot | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [showOnlyChanges, setShowOnlyChanges] = useState(true);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const snapshot = await captureSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cluster-snapshot-${snapshot.timestamp.slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast({ type: 'success', title: 'Snapshot exported' });
    } catch (err) {
      addToast({ type: 'error', title: 'Export failed', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
    setExporting(false);
  }, [addToast]);

  const handleCaptureLeft = useCallback(async () => {
    setExporting(true);
    try {
      const snapshot = await captureSnapshot();
      setLeftSnapshot(snapshot);
      addToast({ type: 'success', title: 'Left snapshot captured' });
      if (rightSnapshot) setDiff(compareSnapshots(snapshot, rightSnapshot));
    } catch (err) {
      addToast({ type: 'error', title: 'Capture failed' });
    }
    setExporting(false);
  }, [rightSnapshot, addToast]);

  const handleCaptureRight = useCallback(async () => {
    setExporting(true);
    try {
      const snapshot = await captureSnapshot();
      setRightSnapshot(snapshot);
      addToast({ type: 'success', title: 'Right snapshot captured' });
      if (leftSnapshot) setDiff(compareSnapshots(leftSnapshot, snapshot));
    } catch (err) {
      addToast({ type: 'error', title: 'Capture failed' });
    }
    setExporting(false);
  }, [leftSnapshot, addToast]);

  const handleUpload = useCallback((side: 'left' | 'right') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const snapshot = JSON.parse(text) as ClusterSnapshot;
      if (side === 'left') {
        setLeftSnapshot(snapshot);
        if (rightSnapshot) setDiff(compareSnapshots(snapshot, rightSnapshot));
      } else {
        setRightSnapshot(snapshot);
        if (leftSnapshot) setDiff(compareSnapshots(leftSnapshot, snapshot));
      }
      addToast({ type: 'success', title: `${side} snapshot loaded from file` });
    };
    input.click();
  }, [leftSnapshot, rightSnapshot, addToast]);

  const changedCount = diff?.filter(r => r.changed).length ?? 0;
  const displayRows = diff && showOnlyChanges ? diff.filter(r => r.changed) : diff;

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <GitCompare className="w-6 h-6 text-purple-500" />
            Config Compare
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Capture cluster snapshots and compare configurations side by side
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Snapshot
          </button>
          <div className="h-6 border-l border-slate-700" />
          <button onClick={handleCaptureLeft} disabled={exporting} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded disabled:opacity-50">
            Capture Left (Now)
          </button>
          <button onClick={() => handleUpload('left')} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded">
            <Upload className="w-3.5 h-3.5" /> Upload Left
          </button>
          <div className="h-6 border-l border-slate-700" />
          <button onClick={handleCaptureRight} disabled={exporting} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded disabled:opacity-50">
            Capture Right (Now)
          </button>
          <button onClick={() => handleUpload('right')} className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 rounded">
            <Upload className="w-3.5 h-3.5" /> Upload Right
          </button>
        </div>

        {/* Snapshot info */}
        {(leftSnapshot || rightSnapshot) && (
          <div className="grid grid-cols-2 gap-4">
            <div className={cn('bg-slate-900 rounded-lg border p-3', leftSnapshot ? 'border-blue-800' : 'border-slate-800')}>
              <div className="text-xs text-slate-500 mb-1">Left Snapshot</div>
              {leftSnapshot ? (
                <div className="text-sm text-slate-200">
                  {new Date(leftSnapshot.timestamp).toLocaleString()}
                  <span className="text-xs text-slate-500 ml-2">v{leftSnapshot.clusterVersion} · {leftSnapshot.nodes.count} nodes</span>
                </div>
              ) : <div className="text-sm text-slate-500">Not captured</div>}
            </div>
            <div className={cn('bg-slate-900 rounded-lg border p-3', rightSnapshot ? 'border-green-800' : 'border-slate-800')}>
              <div className="text-xs text-slate-500 mb-1">Right Snapshot</div>
              {rightSnapshot ? (
                <div className="text-sm text-slate-200">
                  {new Date(rightSnapshot.timestamp).toLocaleString()}
                  <span className="text-xs text-slate-500 ml-2">v{rightSnapshot.clusterVersion} · {rightSnapshot.nodes.count} nodes</span>
                </div>
              ) : <div className="text-sm text-slate-500">Not captured</div>}
            </div>
          </div>
        )}

        {/* Diff table */}
        {diff && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Comparison — {changedCount} change{changedCount !== 1 ? 's' : ''} found
              </h2>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={showOnlyChanges} onChange={(e) => setShowOnlyChanges(e.target.checked)} className="rounded" />
                Show only changes
              </label>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-2 text-left text-xs text-slate-400 font-medium w-16"></th>
                    <th className="px-4 py-2 text-left text-xs text-slate-400 font-medium">Field</th>
                    <th className="px-4 py-2 text-left text-xs text-slate-400 font-medium">Left</th>
                    <th className="px-4 py-2 text-left text-xs text-slate-400 font-medium">Right</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(displayRows || []).map((row, idx) => (
                    <tr key={idx} className={row.changed ? 'bg-yellow-950/20' : ''}>
                      <td className="px-4 py-2">
                        {row.changed ? (
                          row.left && !row.right ? <Minus className="w-3.5 h-3.5 text-red-400" /> :
                          !row.left && row.right ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> :
                          <GitCompare className="w-3.5 h-3.5 text-yellow-400" />
                        ) : <CheckCircle className="w-3.5 h-3.5 text-slate-600" />}
                      </td>
                      <td className="px-4 py-2 text-slate-300 font-medium">
                        <span className="text-xs text-slate-500 mr-2">{row.category}</span>
                        {row.field}
                      </td>
                      <td className={cn('px-4 py-2 font-mono text-xs', row.changed ? 'text-red-300' : 'text-slate-400')}>{row.left || '—'}</td>
                      <td className={cn('px-4 py-2 font-mono text-xs', row.changed ? 'text-green-300' : 'text-slate-400')}>{row.right || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!diff && !leftSnapshot && !rightSnapshot && (
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-12 text-center">
            <GitCompare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-300 mb-2">Compare Cluster Configurations</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Capture a snapshot now, make changes, then capture another snapshot to see what changed.
              Or upload previously exported snapshots to compare.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
