import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../primitives/Card';
import { Badge } from '../primitives/Badge';
import { GateCard } from './GateCard';
import { ReadinessScore } from './ReadinessScore';
import { WaiverDialog } from './WaiverDialog';
import type { ReadinessReport, ReadinessCategory } from './types';

interface ReadinessChecklistProps {
  report: ReadinessReport;
  onWaive: (gateId: string, reason: string) => void;
  onReVerify: (gateId: string) => void;
  onSwitchToWizard: () => void;
}

/** Dashboard-style checklist with expandable category sections. */
export function ReadinessChecklist({ report, onWaive, onReVerify, onSwitchToWizard }: ReadinessChecklistProps) {
  const [expanded, setExpanded] = React.useState<Set<ReadinessCategory>>(() => {
    // Auto-expand categories with failures
    const failing = new Set<ReadinessCategory>();
    for (const cat of report.categories) {
      if (cat.gates.some((g) => g.status === 'fail')) {
        failing.add(cat.id);
      }
    }
    return failing;
  });
  const [waiverTarget, setWaiverTarget] = React.useState<string | null>(null);

  const toggle = (catId: ReadinessCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const waiverGate = waiverTarget
    ? report.categories.flatMap((c) => c.gates).find((g) => g.id === waiverTarget)
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
      {/* Main checklist */}
      <div className="space-y-3">
        {report.categories.map((cat) => {
          const isOpen = expanded.has(cat.id);
          const passCount = cat.gates.filter((g) => g.status === 'pass' || g.status === 'waived').length;
          const failCount = cat.gates.filter((g) => g.status === 'fail').length;

          return (
            <Card key={cat.id}>
              <button
                onClick={() => toggle(cat.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-slate-200">
                      {cat.label}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">{cat.description}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm">{passCount} passed</Badge>
                  {failCount > 0 && <Badge variant="error" size="sm">{failCount} failed</Badge>}
                  <span className="text-xs text-slate-500">
                    {passCount}/{cat.gates.length}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-2 border-t border-slate-800 pt-3">
                  {cat.gates.map((gate) => (
                    <GateCard
                      key={gate.id}
                      gate={gate}
                      onReVerify={onReVerify}
                      onWaive={(gateId) => setWaiverTarget(gateId)}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Right sidebar — score */}
      <div className="space-y-4">
        <Card className="p-4">
          <ReadinessScore score={report.score} categories={report.categories} />
        </Card>

        <button
          onClick={onSwitchToWizard}
          className={cn(
            'w-full px-4 py-2 text-sm rounded-lg transition-colors',
            'text-violet-400 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20',
          )}
        >
          Open guided wizard
        </button>
      </div>

      {/* Waiver modal */}
      <WaiverDialog
        gateTitle={waiverGate?.title || ''}
        open={waiverTarget !== null}
        onClose={() => setWaiverTarget(null)}
        onConfirm={(reason) => {
          if (waiverTarget) onWaive(waiverTarget, reason);
          setWaiverTarget(null);
        }}
      />
    </div>
  );
}
