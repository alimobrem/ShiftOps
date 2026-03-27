import React, { useState, useMemo } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Clock, Activity, Settings, Search,
  ChevronDown, ChevronRight, RotateCcw, Play, CheckCircle, AlertTriangle,
  XCircle, X, Eye, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../components/primitives/Card';
import { EmptyState } from '../components/primitives/EmptyState';

// ===== Types =====

interface Finding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  summary: string;
  resources: Array<{ kind: string; name: string; namespace?: string }>;
  autoFixable: boolean;
  timestamp: number;
}

interface Prediction {
  id: string;
  category: string;
  title: string;
  detail: string;
  eta: string;
  confidence: number;
  resources: Array<{ kind: string; name: string; namespace?: string }>;
  recommendedAction?: string;
  timestamp: number;
}

interface ActionRecord {
  id: string;
  findingId: string;
  timestamp: number;
  category: string;
  tool: string;
  input: Record<string, unknown>;
  status: 'proposed' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  beforeState: string;
  afterState: string;
  error?: string;
  reasoning: string;
  durationMs: number;
  rollbackAvailable: boolean;
  resources: Array<{ kind: string; name: string; namespace?: string }>;
}

type MonitorTab = 'status' | 'history' | 'config';

const TRUST_LEVELS = [
  { level: 0, label: 'Monitor Only', description: 'Observe and report findings. No automated actions.' },
  { level: 1, label: 'Suggest', description: 'Suggest fixes with dry-run previews. Requires manual approval.' },
  { level: 2, label: 'Ask First', description: 'Propose fixes and wait for confirmation before applying.' },
  { level: 3, label: 'Auto-fix Safe', description: 'Automatically fix low-risk issues. Confirm dangerous changes.' },
  { level: 4, label: 'Full Auto', description: 'Automatically fix all issues within enabled categories.' },
] as const;

const AUTO_FIX_CATEGORIES = [
  { id: 'crashloop', label: 'CrashLoopBackOff', description: 'Restart pods stuck in crash loops' },
  { id: 'resource_limits', label: 'Resource Limits', description: 'Adjust CPU/memory requests and limits' },
  { id: 'cert_expiry', label: 'Certificate Expiry', description: 'Renew expiring TLS certificates' },
  { id: 'scaling', label: 'Scaling', description: 'Scale replicas based on load patterns' },
  { id: 'cleanup', label: 'Cleanup', description: 'Remove completed jobs, evicted pods' },
  { id: 'network', label: 'Network', description: 'Fix service/ingress misconfigurations' },
] as const;

const STATUS_COLORS: Record<ActionRecord['status'], string> = {
  proposed: 'bg-blue-900/50 text-blue-300',
  executing: 'bg-yellow-900/50 text-yellow-300',
  completed: 'bg-green-900/50 text-green-300',
  failed: 'bg-red-900/50 text-red-300',
  rolled_back: 'bg-slate-700 text-slate-300',
};

const SEVERITY_COLORS: Record<Finding['severity'], string> = {
  critical: 'bg-red-900/50 text-red-300',
  warning: 'bg-yellow-900/50 text-yellow-300',
  info: 'bg-blue-900/50 text-blue-300',
};

function formatRelativeTime(timestamp: number): string {
  const ms = Date.now() - timestamp;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default function MonitorView() {
  const [activeTab, setActiveTab] = useState<MonitorTab>('status');

  // Live Status state
  const [findings, setFindings] = useState<Finding[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [connected, setConnected] = useState(false);

  // Fix History state
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActionRecord['status'] | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const PAGE_SIZE = 20;

  // Configuration state
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [trustLevel, setTrustLevel] = useState(0);
  const [autoFixCategories, setAutoFixCategories] = useState<Set<string>>(new Set());

  // Derived counts
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  // Filtered history
  const filteredActions = useMemo(() => {
    let result = actions;
    if (statusFilter !== 'all') result = result.filter((a) => a.status === statusFilter);
    if (categoryFilter !== 'all') result = result.filter((a) => a.category === categoryFilter);
    if (historySearch) {
      const q = historySearch.toLowerCase();
      result = result.filter(
        (a) =>
          a.tool.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.reasoning.toLowerCase().includes(q) ||
          a.resources.some((r) => r.name.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [actions, statusFilter, categoryFilter, historySearch]);

  const pagedActions = filteredActions.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredActions.length / PAGE_SIZE));

  const categories = useMemo(() => {
    const cats = new Set(actions.map((a) => a.category));
    return Array.from(cats).sort();
  }, [actions]);

  const toggleAutoFixCategory = (id: string) => {
    setAutoFixCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-violet-500" />
              Monitor
            </h1>
            <p className="text-sm text-slate-400 mt-1">SRE command center — findings, predictions, and automated fixes</p>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border',
              connected
                ? 'bg-green-900/30 border-green-800'
                : 'bg-slate-900 border-slate-700',
            )}
          >
            {connected ? (
              <ShieldCheck className="w-5 h-5 text-green-400" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-slate-500" />
            )}
            <span className={cn('text-sm font-medium', connected ? 'text-green-300' : 'text-slate-400')}>
              {connected ? 'Monitoring Active' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1" role="tablist" aria-label="Monitor tabs">
            {([
              { id: 'status' as MonitorTab, label: 'Live Status', icon: Activity },
              { id: 'history' as MonitorTab, label: 'Fix History', icon: Clock },
              { id: 'config' as MonitorTab, label: 'Configuration', icon: Settings },
            ]).map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  activeTab === tab.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab: Live Status */}
        {activeTab === 'status' && (
          <div className="space-y-6">
            {/* Severity breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className={cn('bg-slate-900 rounded-lg border p-4', criticalCount > 0 ? 'border-red-800' : 'border-slate-800')}>
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-slate-400">Critical</span>
                </div>
                <div className="text-2xl font-bold text-slate-100">{criticalCount}</div>
              </div>
              <div className={cn('bg-slate-900 rounded-lg border p-4', warningCount > 0 ? 'border-yellow-800' : 'border-slate-800')}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-xs text-slate-400">Warning</span>
                </div>
                <div className="text-2xl font-bold text-slate-100">{warningCount}</div>
              </div>
              <div className={cn('bg-slate-900 rounded-lg border p-4', infoCount > 0 ? 'border-blue-800' : 'border-slate-800')}>
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-slate-400">Info</span>
                </div>
                <div className="text-2xl font-bold text-slate-100">{infoCount}</div>
              </div>
            </div>

            {/* Active findings */}
            {findings.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="w-8 h-8 text-green-400" />}
                title="All clear"
                description="No active findings. The monitor is watching your cluster for issues."
              />
            ) : (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-300">Active Findings</h2>
                {findings.map((finding) => (
                  <Card key={finding.id}>
                    <div className="px-4 py-3 flex items-start gap-3">
                      {finding.severity === 'critical' ? (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      ) : finding.severity === 'warning' ? (
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Activity className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">{finding.title}</span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded', SEVERITY_COLORS[finding.severity])}>
                            {finding.severity}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                            {finding.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{finding.summary}</p>
                        {finding.resources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {finding.resources.map((r, i) => (
                              <span key={i} className="text-xs font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                                {r.kind}/{r.name}
                                {r.namespace && ` (${r.namespace})`}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="text-xs text-slate-500">{formatRelativeTime(finding.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button className="px-2.5 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded flex items-center gap-1.5 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                          Investigate
                        </button>
                        <button className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors">
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Predictions */}
            {predictions.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-300">Predictions</h2>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {predictions.map((pred) => (
                    <Card key={pred.id} className="min-w-[280px] flex-shrink-0">
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-violet-400" />
                          <span className="text-sm font-medium text-slate-200">{pred.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{pred.detail}</p>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500">ETA: {pred.eta}</span>
                          <span className="text-xs text-slate-500">{Math.round(pred.confidence * 100)}% confidence</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3">
                          <div
                            className="bg-violet-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.round(pred.confidence * 100)}%` }}
                          />
                        </div>
                        {pred.recommendedAction && (
                          <button className="w-full px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded flex items-center justify-center gap-1.5 transition-colors">
                            <Play className="w-3.5 h-3.5" />
                            Prevent
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Fix History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Search and filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(0); }}
                  placeholder="Search history..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              {/* Status filter chips */}
              <div className="flex gap-1 bg-slate-900 rounded-lg border border-slate-700 text-xs">
                {(['all', 'completed', 'failed', 'rolled_back'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setHistoryPage(0); }}
                    className={cn(
                      'px-2.5 py-1.5 capitalize transition-colors',
                      statusFilter === s ? 'bg-violet-600 text-white rounded-lg' : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    {s === 'rolled_back' ? 'Rolled Back' : s}
                  </button>
                ))}
              </div>
              {/* Category filter */}
              {categories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setHistoryPage(0); }}
                  className="px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Action table */}
            {filteredActions.length === 0 ? (
              <EmptyState
                icon={<Clock className="w-8 h-8" />}
                title="No actions taken yet"
                description="When the monitor takes automated actions, they will appear here with full audit trails."
              />
            ) : (
              <Card>
                <div className="divide-y divide-slate-800">
                  {/* Table header */}
                  <div className="px-4 py-2.5 grid grid-cols-[auto_1fr_1fr_1fr_100px_80px] gap-3 text-xs font-medium text-slate-500">
                    <span className="w-5" />
                    <span>Time</span>
                    <span>Category / Action</span>
                    <span>Resource</span>
                    <span>Status</span>
                    <span>Duration</span>
                  </div>
                  {/* Table rows */}
                  {pagedActions.map((action) => (
                    <div key={action.id}>
                      <button
                        onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                        className="w-full px-4 py-2.5 grid grid-cols-[auto_1fr_1fr_1fr_100px_80px] gap-3 text-xs text-slate-300 hover:bg-slate-800/30 transition-colors items-center"
                      >
                        {expandedAction === action.id ? (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                        <span className="text-slate-400 text-left">{new Date(action.timestamp).toLocaleString()}</span>
                        <span className="text-left">
                          <span className="text-slate-400">{action.category}</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span className="font-mono">{action.tool}</span>
                        </span>
                        <span className="text-left font-mono truncate">
                          {action.resources.map((r) => `${r.kind}/${r.name}`).join(', ')}
                        </span>
                        <span className={cn('px-1.5 py-0.5 rounded text-center', STATUS_COLORS[action.status])}>
                          {action.status}
                        </span>
                        <span className="text-slate-500 text-right">{formatDuration(action.durationMs)}</span>
                      </button>
                      {/* Expanded detail */}
                      {expandedAction === action.id && (
                        <div className="px-4 pb-4 pt-1 ml-9 space-y-3 border-l-2 border-slate-800">
                          <div>
                            <span className="text-xs font-medium text-slate-500">Reasoning</span>
                            <p className="text-xs text-slate-300 mt-1">{action.reasoning}</p>
                          </div>
                          {action.error && (
                            <div>
                              <span className="text-xs font-medium text-red-400">Error</span>
                              <p className="text-xs text-red-300 mt-1">{action.error}</p>
                            </div>
                          )}
                          {action.beforeState && (
                            <div>
                              <span className="text-xs font-medium text-slate-500">Before</span>
                              <pre className="text-xs text-slate-400 mt-1 bg-slate-900 rounded p-2 overflow-x-auto font-mono">
                                {action.beforeState}
                              </pre>
                            </div>
                          )}
                          {action.afterState && (
                            <div>
                              <span className="text-xs font-medium text-slate-500">After</span>
                              <pre className="text-xs text-slate-400 mt-1 bg-slate-900 rounded p-2 overflow-x-auto font-mono">
                                {action.afterState}
                              </pre>
                            </div>
                          )}
                          {action.rollbackAvailable && action.status === 'completed' && (
                            <button className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1.5 transition-colors">
                              <RotateCcw className="w-3.5 h-3.5" />
                              Rollback
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 flex items-center justify-between border-t border-slate-800">
                    <span className="text-xs text-slate-500">
                      {filteredActions.length} actions total
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                        disabled={historyPage === 0}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-slate-400">
                        {historyPage + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={historyPage >= totalPages - 1}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* Tab: Configuration */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            {/* Enable/disable toggle */}
            <Card>
              <div className="px-4 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Monitor</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enable continuous cluster monitoring and automated remediation
                  </p>
                </div>
                <button
                  onClick={() => setMonitorEnabled(!monitorEnabled)}
                  role="switch"
                  aria-checked={monitorEnabled}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    monitorEnabled ? 'bg-violet-600' : 'bg-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                      monitorEnabled && 'translate-x-5',
                    )}
                  />
                </button>
              </div>
            </Card>

            {/* Trust level */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Trust Level</h3>
              <div className="grid gap-2">
                {TRUST_LEVELS.map((tl) => (
                  <button
                    key={tl.level}
                    onClick={() => setTrustLevel(tl.level)}
                    className={cn(
                      'px-4 py-3 rounded-lg border text-left transition-colors',
                      trustLevel === tl.level
                        ? 'bg-violet-900/30 border-violet-700'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                          trustLevel === tl.level ? 'border-violet-500' : 'border-slate-600',
                        )}
                      >
                        {trustLevel === tl.level && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                      </div>
                      <span className="text-sm font-medium text-slate-200">
                        Level {tl.level}: {tl.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ml-6">{tl.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-fix categories (visible at level 4) */}
            {trustLevel === 4 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Auto-fix Categories</h3>
                <div className="grid gap-2">
                  {AUTO_FIX_CATEGORIES.map((cat) => (
                    <label
                      key={cat.id}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors',
                        autoFixCategories.has(cat.id)
                          ? 'bg-violet-900/20 border-violet-800'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={autoFixCategories.has(cat.id)}
                        onChange={() => toggleAutoFixCategory(cat.id)}
                        className="mt-0.5 rounded border-slate-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-200">{cat.label}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{cat.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Scan Now button */}
            <button className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-2 transition-colors">
              <Play className="w-4 h-4" />
              Scan Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
