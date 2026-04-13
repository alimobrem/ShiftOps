import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrawerShell } from '../../components/primitives/DrawerShell';
import type { AgentEvalStatus, EvalSuiteSummary } from '../../engine/evalStatus';

interface EvalDrawerProps {
  evalStatus: AgentEvalStatus | null | undefined;
  onClose: () => void;
}

const SUITES = ['release', 'safety', 'integration', 'view_designer'] as const;

export function EvalDrawer({ evalStatus, onClose }: EvalDrawerProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (suite: string) => setExpanded((prev) => (prev === suite ? null : suite));

  return (
    <DrawerShell title="Quality Gate Details" onClose={onClose}>
      <div className="space-y-3 text-sm text-slate-300">
        {evalStatus === undefined && (
          <div className="text-slate-500">Loading eval data...</div>
        )}
        {evalStatus === null && (
          <div className="text-slate-500">Eval data unavailable. The agent may not have run evals yet.</div>
        )}

        {evalStatus && SUITES.map((suite) => {
          const s = evalStatus[suite];
          if (!s) return null;
          const isExpanded = expanded === suite;
          return (
            <SuiteCard
              key={suite}
              name={suite}
              suite={s}
              expanded={isExpanded}
              onToggle={() => toggle(suite)}
            />
          );
        })}

        {/* Prompt Audit */}
        {evalStatus?.prompt_audit && Object.keys(evalStatus.prompt_audit).length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Prompt Token Audit</h3>
            {Object.entries(evalStatus.prompt_audit).map(([mode, audit]) => (
              <div key={mode} className="bg-slate-900 rounded-lg border border-slate-800 p-4 mb-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-200 capitalize">{mode}</span>
                  <span className="text-xs text-slate-500">~{audit.estimated_tokens.toLocaleString()} tokens</span>
                </div>
                <div className="space-y-1.5">
                  {audit.sections.map((section) => (
                    <div key={section.name} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-28 truncate">{section.name}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500/60 rounded-full"
                          style={{ width: `${Math.min(section.pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500 w-10 text-right">{section.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Outcomes */}
        {evalStatus?.outcomes && (
          <div className="mt-4">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Outcome Tracking</h3>
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-200">Actions</span>
                <span className={evalStatus.outcomes.gate_passed ? 'text-emerald-400 text-xs' : 'text-red-400 text-xs'}>
                  {evalStatus.outcomes.gate_passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Current: {evalStatus.outcomes.current_actions} &middot; Baseline: {evalStatus.outcomes.baseline_actions}
              </div>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

function SuiteCard({ name, suite, expanded, onToggle }: {
  name: string;
  suite: EvalSuiteSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dims = suite.dimension_averages || {};
  const blockers = suite.blocker_counts || {};
  const hasBlockers = Object.values(blockers).some((v) => v > 0);

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-500" />
            : <ChevronRight className="w-4 h-4 text-slate-500" />}
          <div>
            <h3 className="font-medium text-slate-200 capitalize">{name.replace(/_/g, ' ')}</h3>
            <div className="text-xs text-slate-400 mt-0.5">
              {suite.scenario_count} scenarios &middot; avg {Math.round((suite.average_overall || 0) * 100)}%
              {suite.passed_count != null && ` · ${suite.passed_count} passed`}
            </div>
          </div>
        </div>
        <span className={suite.gate_passed ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
          {suite.gate_passed ? 'PASS' : 'FAIL'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800 space-y-3">
          {/* Dimension breakdown */}
          {Object.keys(dims).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-slate-500 font-medium">Dimensions</div>
              {Object.entries(dims).map(([dim, score]) => {
                const pct = Math.round(score * 100);
                return (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-28 truncate capitalize">{dim.replace(/_/g, ' ')}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-[11px] w-10 text-right',
                      pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400',
                    )}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Blockers */}
          {hasBlockers && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500 font-medium">Blockers Detected</div>
              {Object.entries(blockers).filter(([, v]) => v > 0).map(([blocker, count]) => (
                <div key={blocker} className="flex items-center gap-2 text-xs text-amber-400/80">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{blocker.replace(/_/g, ' ')}: {count}</span>
                </div>
              ))}
            </div>
          )}

          {/* No detail available */}
          {Object.keys(dims).length === 0 && !hasBlockers && (
            <div className="text-xs text-slate-500">No detailed breakdown available for this suite.</div>
          )}
        </div>
      )}
    </div>
  );
}
