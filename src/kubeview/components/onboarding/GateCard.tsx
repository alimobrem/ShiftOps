import React from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, ShieldOff,
  Loader2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '../primitives/Badge';
import type { ReadinessGate, GateStatus } from './types';

interface GateCardProps {
  gate: ReadinessGate;
  onReVerify?: (gateId: string) => void;
  onWaive?: (gateId: string) => void;
}

const STATUS_CONFIG: Record<GateStatus, {
  icon: React.ReactNode;
  variant: 'success' | 'error' | 'warning' | 'default' | 'info' | 'outline';
  label: string;
}> = {
  pass:    { icon: <CheckCircle2 className="w-4 h-4" />, variant: 'success', label: 'Passed' },
  fail:    { icon: <XCircle className="w-4 h-4" />,      variant: 'error',   label: 'Failed' },
  warn:    { icon: <AlertTriangle className="w-4 h-4" />, variant: 'warning', label: 'Warning' },
  unknown: { icon: <HelpCircle className="w-4 h-4" />,    variant: 'default', label: 'Unknown' },
  waived:  { icon: <ShieldOff className="w-4 h-4" />,     variant: 'outline', label: 'Waived' },
  loading: { icon: <Loader2 className="w-4 h-4 animate-spin" />, variant: 'info', label: 'Checking' },
};

/** Individual readiness gate with status badge, evidence, guidance, and action buttons. */
export function GateCard({ gate, onReVerify, onWaive }: GateCardProps) {
  const [expanded, setExpanded] = React.useState(gate.status === 'fail' || gate.status === 'warn');
  const cfg = STATUS_CONFIG[gate.status];

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        gate.status === 'fail'
          ? 'border-red-900/60 bg-red-950/20'
          : gate.status === 'warn'
            ? 'border-amber-900/60 bg-amber-950/20'
            : 'border-slate-800 bg-slate-900/50',
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            gate.status === 'pass' ? 'text-emerald-400' :
            gate.status === 'fail' ? 'text-red-400' :
            gate.status === 'warn' ? 'text-amber-400' :
            gate.status === 'waived' ? 'text-slate-400' :
            'text-slate-500',
          )}>
            {cfg.icon}
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-200 block truncate">{gate.title}</span>
            <span className="text-xs text-slate-500 block truncate">{gate.description}</span>
          </div>
        </div>
        <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800/50 pt-3">
          {/* Evidence */}
          {gate.evidence && (
            <div className="text-xs text-slate-400 bg-slate-800/50 rounded-md p-3">
              <div className="font-medium text-slate-300 mb-1">Evidence</div>
              <p>{gate.evidence.summary}</p>
              {gate.evidence.details && (
                <pre className="mt-2 text-slate-500 whitespace-pre-wrap font-mono text-[11px]">
                  {gate.evidence.details}
                </pre>
              )}
            </div>
          )}

          {/* Fix guidance */}
          {gate.fixGuidance && (gate.status === 'fail' || gate.status === 'warn') && (
            <div className="text-xs bg-violet-950/30 border border-violet-900/40 rounded-md p-3">
              <div className="font-medium text-violet-300 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Remediation
              </div>
              <p className="text-violet-300/80">{gate.fixGuidance}</p>
            </div>
          )}

          {/* Waiver reason */}
          {gate.status === 'waived' && gate.waiverReason && (
            <div className="text-xs text-slate-500 italic">
              Waived: {gate.waiverReason}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {onReVerify && (
              <button
                onClick={() => onReVerify(gate.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Re-verify
              </button>
            )}
            {onWaive && gate.status !== 'pass' && gate.status !== 'waived' && (
              <button
                onClick={() => onWaive(gate.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-md transition-colors"
              >
                <ShieldOff className="w-3 h-3" /> Waive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
