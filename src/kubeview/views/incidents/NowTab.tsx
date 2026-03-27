import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  XCircle, AlertTriangle, Activity, CheckCircle, Eye, X,
  BellOff, Volume2, Clock, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useIncidentFeed } from '../../hooks/useIncidentFeed';
import { useMonitorStore } from '../../store/monitorStore';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { showErrorToast } from '../../engine/errorToast';
import type { IncidentItem, IncidentSeverity } from '../../engine/types/incident';

interface Silence {
  id: string;
  status: { state: string };
  matchers: Array<{ name: string; value: string; isRegex: boolean }>;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  comment: string;
}

async function createQuickSilence(alertName: string, duration = '2h') {
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const res = await fetch('/api/alertmanager/api/v2/silences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matchers: [{ name: 'alertname', value: alertName, isRegex: false }],
      startsAt: new Date().toISOString(),
      endsAt,
      createdBy: 'pulse-ui',
      comment: `Quick silence from Incident Center (${duration})`,
    }),
  });
  if (!res.ok) throw new Error('Failed to create silence');
}

async function expireSilenceRequest(id: string) {
  const res = await fetch(`/api/alertmanager/api/v2/silence/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to expire silence');
}

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
  const queryClient = useQueryClient();
  const { incidents, counts, isLoading } = useIncidentFeed();
  const [silencesExpanded, setSilencesExpanded] = useState(false);
  const [confirmExpireId, setConfirmExpireId] = useState<string | null>(null);

  // Fetch active silences from Alertmanager
  const { data: silences = [] } = useQuery<Silence[]>({
    queryKey: ['incidents', 'silences'],
    queryFn: async () => {
      const res = await fetch('/api/alertmanager/api/v2/silences');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  const activeSilences = useMemo(
    () => silences.filter((s) => s.status.state === 'active'),
    [silences],
  );

  const handleSilence = async (alertName: string) => {
    const addToast = useUIStore.getState().addToast;
    try {
      await createQuickSilence(alertName);
      addToast({ type: 'success', title: 'Silence created', detail: `${alertName} silenced for 2 hours` });
      queryClient.invalidateQueries({ queryKey: ['incidents', 'silences'] });
    } catch (err: unknown) {
      showErrorToast(err, 'Failed to create silence');
    }
  };

  const handleExpire = async (id: string) => {
    const addToast = useUIStore.getState().addToast;
    try {
      await expireSilenceRequest(id);
      addToast({ type: 'success', title: 'Silence expired', detail: `Silence ${id} has been removed` });
      queryClient.invalidateQueries({ queryKey: ['incidents', 'silences'] });
    } catch (err: unknown) {
      showErrorToast(err, 'Failed to expire silence');
    }
    setConfirmExpireId(null);
  };

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

      {/* Active Silences collapsible section */}
      {activeSilences.length > 0 && (
        <Card>
          <button
            onClick={() => setSilencesExpanded((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BellOff className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-slate-200">Active Silences</span>
              <span className="text-xs px-2 py-0.5 bg-violet-900/50 text-violet-300 rounded">
                {activeSilences.length}
              </span>
            </div>
            {silencesExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {silencesExpanded && (
            <div className="divide-y divide-slate-800 border-t border-slate-800">
              {activeSilences.map((silence) => (
                <div key={silence.id} className="px-4 py-3 flex items-start gap-3">
                  <Volume2 className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-200">
                        {silence.comment || 'No comment'}
                      </span>
                    </div>
                    <div className="space-y-0.5 mb-1">
                      {silence.matchers.map((m, i) => (
                        <span key={i} className="text-xs font-mono text-slate-400 mr-2">
                          {m.name}{m.isRegex ? '=~' : '='}{m.value}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Ends: {new Date(silence.endsAt).toLocaleString()}
                      </span>
                      <span>By: {silence.createdBy}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmExpireId(silence.id)}
                    className="px-2.5 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1.5 flex-shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Expire
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

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
              onSilence={
                incident.source === 'prometheus-alert'
                  ? () => handleSilence(incident.title)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Expire Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmExpireId}
        onClose={() => setConfirmExpireId(null)}
        title="Expire Silence"
        description="Are you sure you want to expire this silence? Alerts matching this silence will start firing again."
        confirmLabel="Expire"
        variant="danger"
        onConfirm={() => confirmExpireId && handleExpire(confirmExpireId)}
      />
    </div>
  );
}

function IncidentCard({
  incident,
  onDismiss,
  onSilence,
}: {
  incident: IncidentItem;
  onDismiss?: () => void;
  onSilence?: () => void;
}) {
  const [silencing, setSilencing] = useState(false);

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
          {onSilence && (
            <button
              onClick={async () => {
                setSilencing(true);
                try { await onSilence(); } finally { setSilencing(false); }
              }}
              disabled={silencing}
              className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Silence this alert for 2 hours"
            >
              <BellOff className="w-3.5 h-3.5" />
              {silencing ? 'Silencing...' : 'Silence'}
            </button>
          )}
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
