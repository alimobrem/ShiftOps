import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  XCircle, AlertTriangle, Activity, CheckCircle, Eye, X,
  BellOff, Clock, Loader2, Search, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '../../engine/formatters';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { useIncidentFeed } from '../../hooks/useIncidentFeed';
import { useMonitorStore } from '../../store/monitorStore';
import { useUIStore } from '../../store/uiStore';
import { useAgentStore } from '../../store/agentStore';
import { showErrorToast } from '../../engine/errorToast';
import type { IncidentItem, IncidentSeverity } from '../../engine/types/incident';
import type { InvestigationPhase as PhaseType } from '../../engine/monitorClient';
import { IncidentLifecycleDrawer } from './IncidentLifecycleDrawer';

const DEFAULT_SILENCE_DURATION = '2h';

const SILENCE_DURATION_LABELS: Record<string, string> = {
  '30m': '30 minutes', '1h': '1 hour', '2h': '2 hours',
  '4h': '4 hours', '8h': '8 hours', '24h': '24 hours', '1d': '1 day',
};

function formatSilenceDuration(d: string): string {
  return SILENCE_DURATION_LABELS[d] || d;
}

async function createQuickSilence(
  alertName: string,
  duration = DEFAULT_SILENCE_DURATION,
  namespace?: string,
  severity?: string,
) {
  const durationMatch = duration.match(/^(\d+)(m|h|d)$/);
  let durationMs = 2 * 60 * 60 * 1000;
  if (durationMatch) {
    const value = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2];
    if (unit === 'm') durationMs = value * 60 * 1000;
    else if (unit === 'h') durationMs = value * 60 * 60 * 1000;
    else if (unit === 'd') durationMs = value * 24 * 60 * 60 * 1000;
  }
  const endsAt = new Date(Date.now() + durationMs).toISOString();
  const matchers = [{ name: 'alertname', value: alertName, isRegex: false }];
  if (namespace) matchers.push({ name: 'namespace', value: namespace, isRegex: false });
  if (severity) matchers.push({ name: 'severity', value: severity, isRegex: false });
  const res = await fetch('/api/alertmanager/api/v2/silences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matchers,
      startsAt: new Date().toISOString(),
      endsAt,
      createdBy: useUIStore.getState().impersonateUser || 'pulse-ui',
      comment: `Quick silence from Incident Center (${formatSilenceDuration(duration)})`,
    }),
  });
  if (!res.ok) throw new Error('Failed to create silence');
}

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  critical: 'bg-red-900/50 text-red-300',
  warning: 'bg-yellow-900/50 text-yellow-300',
  info: 'bg-blue-900/50 text-blue-300',
};

type TriageFilter = 'all' | 'new' | 'acknowledged' | 'investigating' | 'auto-fixable';

const TRIAGE_FILTERS: { id: TriageFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'investigating', label: 'Investigating' },
  { id: 'auto-fixable', label: 'Auto-fixable' },
];

export function NowTab() {
  const dismissFinding = useMonitorStore((s) => s.dismissFinding);
  const acknowledgeFinding = useMonitorStore((s) => s.acknowledgeFinding);
  const unacknowledgeFinding = useMonitorStore((s) => s.unacknowledgeFinding);
  const acknowledgedIds = useMonitorStore((s) => s.acknowledgedIds);
  const queryClient = useQueryClient();
  const { incidents, isLoading } = useIncidentFeed();
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all');
  const [undoAckId, setUndoAckId] = useState<string | null>(null);
  const [lifecycleFindingId, setLifecycleFindingId] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Deep-link: auto-focus incident from ?finding=<id> URL param
  useEffect(() => {
    const findingId = new URLSearchParams(window.location.search).get('finding');
    if (findingId && incidents.length > 0) {
      const idx = incidents.findIndex((i) => i.id === findingId || i.sourceRef === findingId);
      if (idx >= 0) setFocusedIdx(idx);
    }
  }, [incidents]);

  const handleAck = useCallback((id: string) => {
    acknowledgeFinding(id);
    setUndoAckId(id);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoAckId(null), 5000);
  }, [acknowledgeFinding]);

  const handleUndoAck = useCallback(() => {
    if (undoAckId) {
      unacknowledgeFinding(undoAckId);
      setUndoAckId(null);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    }
  }, [undoAckId, unacknowledgeFinding]);

  // Sort: noisy incidents below non-noisy of same severity
  const sortedIncidents = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return [...incidents].sort((a, b) => {
      const sevA = severityOrder[a.severity] ?? 3;
      const sevB = severityOrder[b.severity] ?? 3;
      if (sevA !== sevB) return sevA - sevB;
      const noiseA = (a.sourceData as Record<string, unknown>)?.noiseScore as number | undefined;
      const noiseB = (b.sourceData as Record<string, unknown>)?.noiseScore as number | undefined;
      const isNoisyA = (noiseA ?? 0) >= 0.5 ? 1 : 0;
      const isNoisyB = (noiseB ?? 0) >= 0.5 ? 1 : 0;
      if (isNoisyA !== isNoisyB) return isNoisyA - isNoisyB;
      return b.timestamp - a.timestamp;
    });
  }, [incidents]);

  // Filter by triage state and search
  const filteredIncidents = useMemo(() => {
    let list = sortedIncidents;

    if (triageFilter !== 'all') {
      list = list.filter((inc) => {
        switch (triageFilter) {
          case 'new': return inc.freshness === 'new';
          case 'acknowledged': return acknowledgedIds.includes(inc.id);
          case 'investigating': return inc.investigationPhases?.some((p) => p.status === 'running');
          case 'auto-fixable': return inc.autoFixable;
        }
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (inc) =>
          inc.title.toLowerCase().includes(q) ||
          inc.detail.toLowerCase().includes(q) ||
          inc.category.toLowerCase().includes(q) ||
          (inc.namespace || '').toLowerCase().includes(q),
      );
    }

    return list;
  }, [sortedIncidents, triageFilter, acknowledgedIds, searchQuery]);

  // Keyboard shortcuts for incident triage (j/k/s/i/d/a)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('[role="dialog"]')) return;
      if (filteredIncidents.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((prev) => Math.min(prev + 1, filteredIncidents.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((prev) => Math.max(prev - 1, 0));
      } else if (focusedIdx >= 0 && focusedIdx < filteredIncidents.length) {
        const incident = filteredIncidents[focusedIdx];
        if (e.key === 'i') {
          e.preventDefault();
          useUIStore.getState().openDock('agent');
          const agentStore = useAgentStore.getState();
          if (agentStore.connected) {
            agentStore.sendMessage(`The monitor detected this issue:\n\n"${incident.title}: ${incident.detail}"\n\nInvestigate this further. What is the root cause and what should I do to fix it?`);
          }
        } else if (e.key === 's' && incident.source === 'prometheus-alert') {
          e.preventDefault();
          handleSilence(incident.title);
        } else if (e.key === 'd' && incident.source === 'finding') {
          e.preventDefault();
          dismissFinding(incident.id);
        } else if (e.key === 'a') {
          e.preventDefault();
          if (acknowledgedIds.includes(incident.id)) {
            unacknowledgeFinding(incident.id);
          } else {
            handleAck(incident.id);
          }
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [filteredIncidents, focusedIdx, acknowledgedIds]);

  const handleSilence = async (alertName: string, duration = DEFAULT_SILENCE_DURATION, namespace?: string, severity?: string) => {
    const addToast = useUIStore.getState().addToast;
    try {
      await createQuickSilence(alertName, duration, namespace, severity);
      addToast({ type: 'success', title: 'Silence created', detail: `${alertName} silenced for ${formatSilenceDuration(duration)}` });
      queryClient.invalidateQueries({ queryKey: ['incidents', 'silences'] });
    } catch (err: unknown) {
      showErrorToast(err, 'Failed to create silence');
    }
  };

  return (
    <div className="space-y-4">
      {/* Triage filter bar + search */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="flex gap-1 p-1">
          {TRIAGE_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTriageFilter(id)}
              className={cn(
                'px-3 py-1.5 text-xs rounded transition-colors',
                triageFilter === id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {label}
              {id === 'all' && incidents.length > 0 && (
                <span className="ml-1 text-[10px] opacity-60">{incidents.length}</span>
              )}
            </button>
          ))}
        </Card>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter incidents..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Undo ack toast */}
      {undoAckId && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-sm">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">Incident acknowledged</span>
          <button
            onClick={handleUndoAck}
            className="ml-auto px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && incidents.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <span className="text-slate-500 text-sm">Loading incidents...</span>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-8 h-8 text-green-400" />}
          title={triageFilter === 'all' ? 'All clear' : 'No matching incidents'}
          description={triageFilter === 'all' ? 'No active incidents. The cluster is healthy.' : `No incidents match the "${triageFilter}" filter.`}
        />
      ) : (
        <div className="space-y-2" ref={listRef}>
          {filteredIncidents.map((incident, idx) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              focused={idx === focusedIdx}
              acknowledged={acknowledgedIds.includes(incident.id)}
              onAck={() => handleAck(incident.id)}
              onOpenLifecycle={incident.source === 'finding' ? () => setLifecycleFindingId(incident.id) : undefined}
              onDismiss={incident.source === 'finding' ? () => dismissFinding(incident.id) : undefined}
              onSilence={
                incident.source === 'prometheus-alert'
                  ? (duration?: string) => handleSilence(incident.title, duration, incident.namespace, incident.severity)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Lifecycle drawer */}
      {lifecycleFindingId && (
        <IncidentLifecycleDrawer
          findingId={lifecycleFindingId}
          onClose={() => setLifecycleFindingId(null)}
        />
      )}
    </div>
  );
}

function IncidentCard({
  incident,
  focused,
  acknowledged,
  onAck,
  onOpenLifecycle,
  onDismiss,
  onSilence,
}: {
  incident: IncidentItem;
  focused?: boolean;
  acknowledged?: boolean;
  onAck?: () => void;
  onOpenLifecycle?: () => void;
  onDismiss?: () => void;
  onSilence?: (duration?: string) => void;
}) {
  const [silencing, setSilencing] = useState(false);
  const [confirmSilence, setConfirmSilence] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState(DEFAULT_SILENCE_DURATION);
  const cardRef = useRef<HTMLDivElement>(null);

  const noiseScore = (incident.sourceData as Record<string, unknown>)?.noiseScore as number | undefined;
  const isNoisy = (noiseScore ?? 0) >= 0.5;

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  return (
    <div ref={cardRef}>
    <Card
      className={cn(
        focused && 'ring-1 ring-violet-500/60',
        isNoisy && 'opacity-60',
        onOpenLifecycle && 'cursor-pointer',
      )}
    >
      <div
        className="px-4 py-3 flex items-start gap-3"
        onClick={onOpenLifecycle}
        role={onOpenLifecycle ? 'button' : undefined}
        tabIndex={onOpenLifecycle ? 0 : undefined}
        onKeyDown={onOpenLifecycle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLifecycle(); } } : undefined}
      >
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
            {incident.autoFixable && (
              <span className="text-xs px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300 rounded border border-emerald-700/40">
                Auto-fixable
              </span>
            )}
            {incident.category === 'change_risk' && (
              <span className="text-xs px-1.5 py-0.5 bg-orange-900/50 text-orange-300 rounded border border-orange-700/40">
                Deploy Risk
              </span>
            )}
            {isNoisy && (
              <span
                className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded"
                aria-description="Likely transient - noise score above threshold"
              >
                Likely transient
              </span>
            )}
            {acknowledged && (
              <span className="text-xs px-1.5 py-0.5 bg-violet-900/40 text-violet-300 rounded">
                Ack'd
              </span>
            )}
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
          {incident.investigationPhases && incident.investigationPhases.length > 0 && (
            <InvestigationPhases phases={incident.investigationPhases} planName={incident.planName} />
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{formatRelativeTime(incident.timestamp)}</span>
            {(() => {
              const runbookUrl = (incident.sourceData as Record<string, unknown>)?.annotations
                ? ((incident.sourceData as Record<string, Record<string, string>>).annotations?.runbook_url)
                : undefined;
              return runbookUrl ? (
                <a href={runbookUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  onClick={(e) => e.stopPropagation()}>
                  Runbook →
                </a>
              ) : null;
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onAck && !acknowledged && (
            <button
              onClick={onAck}
              className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors"
              title="Acknowledge (a)"
            >
              <Check className="w-3.5 h-3.5" />
              Ack
            </button>
          )}
          <button
            onClick={() => {
              useUIStore.getState().openDock('agent');
              const { connectAndSend } = useAgentStore.getState();
              connectAndSend(
                `The monitor detected this issue:\n\n"${incident.title}: ${incident.detail}"\n\nInvestigate this further. What is the root cause and what should I do to fix it?`,
              );
            }}
            className="px-2.5 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Investigate
          </button>
          {onSilence && (
            <button
              onClick={() => setConfirmSilence(true)}
              disabled={silencing}
              className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Silence this alert for ${formatSilenceDuration(silenceDuration)}`}
            >
              <BellOff className="w-3.5 h-3.5" />
              {silencing ? 'Silencing...' : 'Silence'}
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => setConfirmDismiss(true)}
              className="px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded flex items-center gap-1.5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Dismiss
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSilence}
        onClose={() => setConfirmSilence(false)}
        title="Silence Alert"
        description={`Silence "${incident.title}" for ${formatSilenceDuration(silenceDuration)}?`}
        confirmLabel="Silence"
        variant="warning"
        loading={silencing}
        onConfirm={async () => {
          if (onSilence) {
            setSilencing(true);
            try { await onSilence(silenceDuration); } finally { setSilencing(false); }
          }
          setConfirmSilence(false);
        }}
      >
        <div className="flex gap-1 mt-2">
          {['30m', '1h', '2h', '4h', '8h', '24h'].map((d) => (
            <button
              key={d}
              onClick={() => setSilenceDuration(d)}
              className={cn(
                'px-2.5 py-1 text-xs rounded transition-colors',
                silenceDuration === d
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-600/50'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDismiss}
        onClose={() => setConfirmDismiss(false)}
        title="Dismiss Finding"
        description="Dismiss this finding? It won't appear again until the next scan."
        confirmLabel="Dismiss"
        variant="warning"
        onConfirm={() => {
          onDismiss?.();
          setConfirmDismiss(false);
        }}
      />
    </Card>
    {focused && (
      <div className="text-[10px] text-slate-600 text-right -mt-1 mr-1">
        <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">a</kbd> ack
        {' '} · <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">i</kbd> investigate
        {onSilence && <> · <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">s</kbd> silence</>}
        {onDismiss && <> · <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">d</kbd> dismiss</>}
      </div>
    )}
    </div>
  );
}


const PHASE_LABELS: Record<string, string> = {
  triage: 'Triage',
  diagnose: 'Diagnose',
  remediate: 'Remediate',
  verify: 'Verify',
  postmortem: 'Postmortem',
};

function InvestigationPhases({ phases, planName }: { phases: PhaseType[]; planName?: string }) {
  return (
    <div className="mb-2 py-2 px-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
      {planName && (
        <div className="text-[10px] text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
          {planName}
        </div>
      )}
      <div className="flex items-center gap-1">
        {phases.map((phase, idx) => {
          const label = PHASE_LABELS[phase.id] || phase.id;
          const isLast = idx === phases.length - 1;
          return (
            <div key={phase.id} className="flex items-center gap-1">
              <div className="flex items-center gap-1">
                {phase.status === 'complete' && (
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                )}
                {phase.status === 'running' && (
                  <Loader2 className="w-3 h-3 text-violet-400 animate-spin shrink-0" />
                )}
                {phase.status === 'failed' && (
                  <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                {phase.status === 'pending' && (
                  <div className="w-3 h-3 rounded-full border border-slate-600 shrink-0" />
                )}
                {phase.status === 'skipped' && (
                  <div className="w-3 h-3 rounded-full bg-slate-700 shrink-0" />
                )}
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    phase.status === 'complete' && 'text-emerald-400',
                    phase.status === 'running' && 'text-violet-300',
                    phase.status === 'failed' && 'text-red-400',
                    phase.status === 'pending' && 'text-slate-500',
                    phase.status === 'skipped' && 'text-slate-600',
                  )}
                  title={phase.summary || undefined}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div className={cn(
                  'w-4 h-px mx-0.5',
                  phase.status === 'complete' ? 'bg-emerald-700' : 'bg-slate-700',
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
