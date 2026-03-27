import {
  XCircle, AlertTriangle, Activity, CheckCircle, Eye, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useIncidentFeed } from '../../hooks/useIncidentFeed';
import { useMonitorStore } from '../../store/monitorStore';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import type { IncidentItem, IncidentSeverity } from '../../engine/types/incident';

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
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

export function NowTab() {
  const dismissFinding = useMonitorStore((s) => s.dismissFinding);
  const { incidents, counts, isLoading } = useIncidentFeed();

  return (
    <div className="space-y-6">
      {/* Severity cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cn('bg-slate-900 rounded-lg border p-4', counts.critical > 0 ? 'border-red-800' : 'border-slate-800')}>
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-400">Critical</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{counts.critical}</div>
        </div>
        <div className={cn('bg-slate-900 rounded-lg border p-4', counts.warning > 0 ? 'border-yellow-800' : 'border-slate-800')}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-slate-400">Warning</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{counts.warning}</div>
        </div>
        <div className={cn('bg-slate-900 rounded-lg border p-4', counts.info > 0 ? 'border-blue-800' : 'border-slate-800')}>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-slate-400">Info</span>
          </div>
          <div className="text-2xl font-bold text-slate-100">{counts.info}</div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && incidents.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <span className="text-slate-500 text-sm">Loading incidents...</span>
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-8 h-8 text-green-400" />}
          title="All clear"
          description="No active incidents. The cluster is healthy."
        />
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              onDismiss={incident.source === 'finding' ? () => dismissFinding(incident.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident, onDismiss }: { incident: IncidentItem; onDismiss?: () => void }) {
  return (
    <Card>
      <div className="px-4 py-3 flex items-start gap-3">
        {incident.severity === 'critical' ? (
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        ) : incident.severity === 'warning' ? (
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        ) : (
          <Activity className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{incident.title}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', SEVERITY_COLORS[incident.severity])}>
              {incident.severity}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
              {incident.source}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
              {incident.category}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-2">{incident.detail}</p>
          {incident.resources.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {incident.resources.map((r, i) => (
                <span key={i} className="text-xs font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                  {r.kind}/{r.name}
                  {r.namespace && ` (${r.namespace})`}
                </span>
              ))}
            </div>
          )}
          <span className="text-xs text-slate-500">{formatRelativeTime(incident.timestamp)}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              useUIStore.getState().openDock('agent');
              const agentStore = useAgentStore.getState();
              if (agentStore.connected) {
                agentStore.sendMessage(
                  `The monitor detected this issue:\n\n"${incident.title}: ${incident.detail}"\n\nInvestigate this further. What is the root cause and what should I do to fix it?`,
                );
              }
            }}
            className="px-2.5 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Investigate
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Dismiss
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
