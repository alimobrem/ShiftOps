import { useState } from 'react';
import {
  CheckCircle, XCircle, Clock, Search, Eye, AlertTriangle, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '../../engine/formatters';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useMonitorStore } from '../../store/monitorStore';
import type { ActionReport } from '../../engine/monitorClient';

const STATUS_COLORS: Record<string, string> = {
  proposed: 'bg-blue-900/50 text-blue-300',
  executing: 'bg-yellow-900/50 text-yellow-300',
  completed: 'bg-green-900/50 text-green-300',
  failed: 'bg-red-900/50 text-red-300',
  rolled_back: 'bg-slate-700 text-slate-300',
};

interface SimulationResult {
  tool: string;
  risk: string;
  description: string;
  reversible: boolean;
  estimatedDuration: string;
  fixBlastRadius?: Array<{ id: string; kind: string; name: string; namespace: string }>;
  fixUpstreamDeps?: Array<{ id: string; kind: string; name: string; namespace: string }>;
}

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-900/50 text-red-300',
  medium: 'bg-amber-900/50 text-amber-300',
  low: 'bg-emerald-900/50 text-emerald-300',
};

export function ActionsTab() {
  const pendingActions = useMonitorStore((s) => s.pendingActions);
  const approveAction = useMonitorStore((s) => s.approveAction);
  const rejectAction = useMonitorStore((s) => s.rejectAction);

  const [searchQuery, setSearchQuery] = useState('');
  const [confirmBulk, setConfirmBulk] = useState<'approve' | 'reject' | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const handleBulkAction = async (action: 'approve' | 'reject') => {
    setBulkProcessing(true);
    const fn = action === 'approve' ? approveAction : rejectAction;
    for (const a of pendingActions) {
      fn(a.id);
      await new Promise((r) => setTimeout(r, 100));
    }
    setBulkProcessing(false);
    setConfirmBulk(null);
  };

  const filteredPending = searchQuery
    ? pendingActions.filter((a) => {
        const q = searchQuery.toLowerCase();
        return a.tool.toLowerCase().includes(q) || (a.reasoning || '').toLowerCase().includes(q);
      })
    : pendingActions;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search pending actions..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Pending actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            Pending Approval ({pendingActions.length})
          </h2>
          {pendingActions.length > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmBulk('approve')} className="px-2.5 py-1 text-xs bg-green-600/20 text-green-300 border border-green-700/50 rounded hover:bg-green-600/30 transition-colors">
                Approve All ({pendingActions.length})
              </button>
              <button onClick={() => setConfirmBulk('reject')} className="px-2.5 py-1 text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded hover:bg-slate-600 transition-colors">
                Reject All
              </button>
            </div>
          )}
        </div>
        {filteredPending.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-8 h-8 text-green-400" />}
            title="No pending actions"
            description="All proposed actions have been reviewed. New proposals will appear here."
            className="py-8"
          />
        ) : (
          filteredPending.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={() => approveAction(action.id)}
              onReject={() => rejectAction(action.id)}
            />
          ))
        )}
      </div>

      {/* Bulk action confirmation */}
      <ConfirmDialog
        open={confirmBulk !== null}
        onClose={() => setConfirmBulk(null)}
        title={confirmBulk === 'approve' ? 'Approve All Actions' : 'Reject All Actions'}
        description={`${confirmBulk === 'approve' ? 'Approve' : 'Reject'} all ${pendingActions.length} pending actions?`}
        confirmLabel={confirmBulk === 'approve' ? 'Approve All' : 'Reject All'}
        variant="warning"
        loading={bulkProcessing}
        onConfirm={() => confirmBulk && handleBulkAction(confirmBulk)}
      />
    </div>
  );
}

function ActionCardHeader({ action }: { action: ActionReport }) {
  return (
    <div className="flex items-center gap-2 mb-1 flex-wrap">
      <span className="text-sm font-medium text-slate-200 font-mono">{action.tool}</span>
      <span className={cn('text-xs px-1.5 py-0.5 rounded', STATUS_COLORS[action.status])}>
        {action.status}
      </span>
      {action.causeCategory && (
        <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
          {action.causeCategory}
        </span>
      )}
      {action.confidence != null && (
        <span
          className={cn(
            'text-xs font-mono',
            action.confidence >= 0.8 ? 'text-green-400' : action.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400',
          )}
          title={`Agent confidence this fix will resolve the issue: ${Math.round(action.confidence * 100)}%`}
          aria-label={`Agent confidence: ${Math.round(action.confidence * 100)}%`}
        >
          {Math.round(action.confidence * 100)}%
        </span>
      )}
      {action.durationMs != null && (
        <span className="text-xs text-slate-500">{action.durationMs}ms</span>
      )}
    </div>
  );
}

function PendingActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: ActionReport;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const resource = action.beforeState
    ? action.beforeState.split('\n')[0].slice(0, 60)
    : action.tool;

  const handlePreviewImpact = async () => {
    if (simulation) { setSimulation(null); return; }
    setSimLoading(true);
    try {
      const res = await fetch('/api/agent/monitor/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: action.tool,
          input: action.input,
        }),
      });
      if (res.ok) {
        setSimulation(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <Card>
      <div className="px-4 py-3 flex items-start gap-3">
        <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <ActionCardHeader action={action} />
          {action.fixDescription && (
            <p className="text-xs text-slate-300 mb-1">{action.fixDescription}</p>
          )}
          {action.reasoning && (
            <p className="text-xs text-slate-400 mb-2">{action.reasoning}</p>
          )}
          {action.fixStrategy && (
            <div className="text-xs text-slate-500 mb-2">
              Strategy: <span className="text-slate-400">{action.fixStrategy}</span>
            </div>
          )}
          {action.beforeState && (
            <pre className="text-xs text-slate-500 bg-slate-800 rounded p-2 mb-2 overflow-x-auto font-mono max-h-24">
              {action.beforeState}
            </pre>
          )}
          <span className="text-xs text-slate-500">{formatRelativeTime(action.timestamp)}</span>

          {/* Simulation preview */}
          {simulation && (
            <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 space-y-2">
              <div className="flex items-center gap-2">
                <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', RISK_COLORS[simulation.risk] || 'bg-slate-800 text-slate-400')}>
                  {simulation.risk} risk
                </span>
                <span className={cn('text-xs px-1.5 py-0.5 rounded', simulation.reversible ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300')}>
                  {simulation.reversible ? 'Reversible' : 'Irreversible'}
                </span>
                <span className="text-xs text-slate-500">{simulation.estimatedDuration}</span>
              </div>
              <p className="text-xs text-slate-300">{simulation.description}</p>
              {simulation.fixBlastRadius && simulation.fixBlastRadius.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Fix affects ({simulation.fixBlastRadius.length} resources)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {simulation.fixBlastRadius.map((r) => (
                      <span key={r.id} className="text-xs font-mono px-1.5 py-0.5 bg-amber-900/20 text-amber-300 rounded border border-amber-800/30">
                        {r.kind}/{r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {simulation.fixUpstreamDeps && simulation.fixUpstreamDeps.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Depends on
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {simulation.fixUpstreamDeps.map((r) => (
                      <span key={r.id} className="text-xs font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                        {r.kind}/{r.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handlePreviewImpact}
            disabled={simLoading}
            className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5" />
            {simLoading ? 'Loading...' : simulation ? 'Hide Impact' : 'Preview Impact'}
          </button>
          <button
            onClick={() => setConfirmApprove(true)}
            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={() => setConfirmReject(true)}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        title="Approve Action"
        description={`Approve this action? It will execute ${action.tool} on ${resource}.`}
        confirmLabel="Approve"
        variant="warning"
        onConfirm={() => {
          onApprove();
          setConfirmApprove(false);
        }}
      />

      <ConfirmDialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Reject Action"
        description={`Reject this action? The agent proposed ${action.tool} on ${resource} — this will not be executed.`}
        confirmLabel="Reject"
        variant="danger"
        onConfirm={() => {
          onReject();
          setConfirmReject(false);
        }}
      />
    </Card>
  );
}
