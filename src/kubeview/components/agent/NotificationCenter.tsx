import { useEffect, useRef, useState } from 'react';
import { X, CheckCheck, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, ListTodo, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FindingCard, type Finding } from './FindingCard';
import { PredictionCard, type Prediction } from './PredictionCard';

export interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

interface PendingAction {
  id: string;
  title: string;
  description: string;
  timestamp: number;
}

/** Stub hook — will be replaced by monitorStore integration later */
function useMonitorData() {
  return {
    findings: [] as Finding[],
    predictions: [] as Prediction[],
    pendingActions: [] as PendingAction[],
    unreadCount: 0,
  };
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const { findings, predictions, pendingActions, unreadCount } = useMonitorData();
  const panelRef = useRef<HTMLDivElement>(null);

  const [expandedSections, setExpandedSections] = useState({
    findings: true,
    predictions: true,
    pendingActions: true,
  });
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredFindings = severityFilter === 'all'
    ? findings
    : findings.filter((f) => f.severity === severityFilter);

  const filterButtons: Array<{ value: SeverityFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'critical', label: 'Critical' },
    { value: 'warning', label: 'Warning' },
    { value: 'info', label: 'Info' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        data-testid="notification-backdrop"
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Notification center"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Notifications</h2>
            {unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {/* Mark all read - stub for now */}}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              aria-label="Mark all read"
            >
              <CheckCheck className="h-3 w-3" aria-hidden="true" />
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close notification center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Severity filters */}
        <div className="flex items-center gap-1 border-b border-slate-700 px-4 py-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setSeverityFilter(btn.value)}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                severityFilter === btn.value
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Active Findings */}
          <section>
            <button
              onClick={() => toggleSection('findings')}
              className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expandedSections.findings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Active Findings
              <span className="ml-auto text-slate-500 normal-case font-normal">{filteredFindings.length}</span>
            </button>
            {expandedSections.findings && (
              <div className="mt-2 space-y-2">
                {filteredFindings.length === 0 ? (
                  <EmptySection icon={AlertTriangle} message="No active findings" />
                ) : (
                  filteredFindings.map((f) => (
                    <FindingCard key={f.id} finding={f} compact />
                  ))
                )}
              </div>
            )}
          </section>

          {/* Predictions */}
          <section>
            <button
              onClick={() => toggleSection('predictions')}
              className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expandedSections.predictions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Predictions
              <span className="ml-auto text-slate-500 normal-case font-normal">{predictions.length}</span>
            </button>
            {expandedSections.predictions && (
              <div className="mt-2 space-y-2">
                {predictions.length === 0 ? (
                  <EmptySection icon={TrendingUp} message="No predictions" />
                ) : (
                  predictions.map((p) => (
                    <PredictionCard key={p.id} prediction={p} compact />
                  ))
                )}
              </div>
            )}
          </section>

          {/* Pending Actions */}
          <section>
            <button
              onClick={() => toggleSection('pendingActions')}
              className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expandedSections.pendingActions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <ListTodo className="h-3 w-3" aria-hidden="true" />
              Pending Actions
              <span className="ml-auto text-slate-500 normal-case font-normal">{pendingActions.length}</span>
            </button>
            {expandedSections.pendingActions && (
              <div className="mt-2 space-y-2">
                {pendingActions.length === 0 ? (
                  <EmptySection icon={ListTodo} message="No pending actions" />
                ) : (
                  pendingActions.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                      <h4 className="text-xs font-medium text-slate-100">{a.title}</h4>
                      <p className="mt-0.5 text-xs text-slate-400">{a.description}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function EmptySection({ icon: Icon, message }: { icon: typeof Inbox; message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-4 justify-center">
      <Icon className="h-4 w-4 text-slate-600" aria-hidden="true" />
      <span className="text-xs text-slate-500">{message}</span>
    </div>
  );
}
