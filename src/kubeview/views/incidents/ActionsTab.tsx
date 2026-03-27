import { useState, useMemo } from 'react';
import {
  CheckCircle, XCircle, RotateCcw, Clock, Play, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useMonitorStore } from '../../store/monitorStore';
import { requestRollback } from '../../engine/fixHistory';
import type { ActionReport } from '../../engine/monitorClient';

const STATUS_COLORS: Record<string, string> = {
  proposed: 'bg-blue-900/50 text-blue-300',
  executing: 'bg-yellow-900/50 text-yellow-300',
  completed: 'bg-green-900/50 text-green-300',
  failed: 'bg-red-900/50 text-red-300',
  rolled_back: 'bg-slate-700 text-slate-300',
};

function formatRelativeTime(timestamp: number): string {
  const ms = Date.now() - timestamp;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function ActionsTab() {
  const pendingActions = useMonitorStore((s) => s.pendingActions);
  const recentActions = useMonitorStore((s) => s.recentActions);
  const approveAction = useMonitorStore((s) => s.approveAction);
  const rejectAction = useMonitorStore((s) => s.rejectAction);
  const loadFixHistory = useMonitorStore((s) => s.loadFixHistory);

  const [searchQuery, setSearchQuery] = useState('');
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const filteredRecent = useMemo(() => {
    if (!searchQuery) return recentActions;
    const q = searchQuery.toLowerCase();
    return recentActions.filter(
      (a) =>
        a.tool.toLowerCase().includes(q) ||
        (a.reasoning || '').toLowerCase().includes(q),
    );
  }, [recentActions, searchQuery]);

  const handleRollback = async (actionId: string) => {
    setRollingBackId(actionId);
    try {
      await requestRollback(actionId);
      loadFixHistory();
    } catch (err) {
      console.error('Rollback failed:', err);
    } finally {
      setRollingBackId(null);
    }
  };

  const hasPending = pendingActions.length > 0;
  const hasRecent = filteredRecent.length > 0;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search actions..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Pending actions */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-violet-400" />
          Pending Approval ({pendingActions.length})
        </h2>
        {!hasPending ? (
          <EmptyState
            icon={<CheckCircle className="w-8 h-8 text-green-400" />}
            title="No pending actions"
            description="All proposed actions have been reviewed. New proposals will appear here."
            className="py-8"
          />
        ) : (
          pendingActions.map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApprove={() => approveAction(action.id)}
              onReject={() => rejectAction(action.id)}
            />
          ))
        )}
      </div>

      {/* Recent actions */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Play className="w-4 h-4 text-violet-400" />
          Recent Actions ({recentActions.length})
        </h2>
        {!hasRecent ? (
          <EmptyState
            icon={<Clock className="w-8 h-8" />}
            title="No recent actions"
            description="Executed actions will appear here with rollback options."
            className="py-8"
          />
        ) : (
          filteredRecent.map((action) => (
            <RecentActionCard
              key={action.id}
              action={action}
              rollingBack={rollingBackId === action.id}
              onRollback={() => handleRollback(action.id)}
            />
          ))
        )}
      </div>
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
  return (
    <Card>
      <div className="px-4 py-3 flex items-start gap-3">
        <Clock className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-slate-200 font-mono">{action.tool}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', STATUS_COLORS[action.status])}>
              {action.status}
            </span>
          </div>
          {action.reasoning && (
            <p className="text-xs text-slate-400 mb-2">{action.reasoning}</p>
          )}
          {action.beforeState && (
            <pre className="text-xs text-slate-500 bg-slate-800 rounded p-2 mb-2 overflow-x-auto font-mono max-h-24">
              {action.beforeState}
            </pre>
          )}
          <span className="text-xs text-slate-500">{formatRelativeTime(action.timestamp)}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onApprove}
            className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Approve
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      </div>
    </Card>
  );
}

function RecentActionCard({
  action,
  rollingBack,
  onRollback,
}: {
  action: ActionReport;
  rollingBack: boolean;
  onRollback: () => void;
}) {
  return (
    <Card>
      <div className="px-4 py-3 flex items-start gap-3">
        {action.status === 'completed' ? (
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        ) : action.status === 'failed' ? (
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        ) : (
          <Clock className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-slate-200 font-mono">{action.tool}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', STATUS_COLORS[action.status])}>
              {action.status}
            </span>
            {action.durationMs != null && (
              <span className="text-xs text-slate-500">{action.durationMs}ms</span>
            )}
          </div>
          {action.reasoning && (
            <p className="text-xs text-slate-400 mb-1">{action.reasoning}</p>
          )}
          {action.error && (
            <p className="text-xs text-red-400 mb-1">{action.error}</p>
          )}
          <span className="text-xs text-slate-500">{formatRelativeTime(action.timestamp)}</span>
        </div>
        {action.status === 'completed' && (
          <button
            disabled={rollingBack}
            onClick={onRollback}
            className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            <RotateCcw className={cn('w-3.5 h-3.5', rollingBack && 'animate-spin')} />
            {rollingBack ? 'Rolling back...' : 'Rollback'}
          </button>
        )}
      </div>
    </Card>
  );
}
