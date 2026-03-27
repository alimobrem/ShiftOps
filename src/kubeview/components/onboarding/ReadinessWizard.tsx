import React from 'react';
import { CheckCircle2, ArrowRight, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReadinessScore } from './ReadinessScore';
import { WaiverDialog } from './WaiverDialog';
import { CategoryStep } from './steps/CategoryStep';
import type { ReadinessReport, ReadinessCategory } from './types';

interface ReadinessWizardProps {
  report: ReadinessReport;
  onWaive: (gateId: string, reason: string) => void;
  onReVerify: (gateId: string) => void;
  onSwitchToChecklist: () => void;
}

const STEP_ORDER: ReadinessCategory[] = [
  'prerequisites', 'security', 'reliability', 'observability', 'operations', 'gitops',
];

/** 6-step wizard with non-linear sidebar navigation — modeled on GitOpsSetupWizard. */
export function ReadinessWizard({ report, onWaive, onReVerify, onSwitchToChecklist }: ReadinessWizardProps) {
  const [activeStep, setActiveStep] = React.useState<ReadinessCategory>('prerequisites');
  const [waiverTarget, setWaiverTarget] = React.useState<string | null>(null);

  const activeCategory = report.categories.find((c) => c.id === activeStep);

  const waiverGate = waiverTarget
    ? report.categories.flatMap((c) => c.gates).find((g) => g.id === waiverTarget)
    : null;

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Left sidebar */}
      <div className="w-60 shrink-0 space-y-4">
        <ReadinessScore score={report.score} categories={report.categories} />

        <nav className="space-y-1">
          {STEP_ORDER.map((stepId) => {
            const cat = report.categories.find((c) => c.id === stepId);
            if (!cat) return null;

            const allPassed = cat.gates.every((g) => g.status === 'pass' || g.status === 'waived');
            const isCurrent = activeStep === stepId;

            return (
              <button
                key={stepId}
                onClick={() => setActiveStep(stepId)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                  isCurrent
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
                )}
              >
                {allPassed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : isCurrent ? (
                  <ArrowRight className="w-4 h-4 text-violet-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={onSwitchToChecklist}
          className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors mt-4"
        >
          Switch to checklist view
        </button>
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        {activeCategory && (
          <CategoryStep
            category={activeCategory}
            onReVerify={onReVerify}
            onWaive={(gateId) => setWaiverTarget(gateId)}
          />
        )}

        {/* Step navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-800">
          <button
            onClick={() => {
              const idx = STEP_ORDER.indexOf(activeStep);
              if (idx > 0) setActiveStep(STEP_ORDER[idx - 1]);
            }}
            disabled={activeStep === STEP_ORDER[0]}
            className={cn(
              'px-4 py-2 text-sm rounded-lg transition-colors',
              activeStep === STEP_ORDER[0]
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-300 bg-slate-800 hover:bg-slate-700',
            )}
          >
            Previous
          </button>
          <span className="text-xs text-slate-500">
            {STEP_ORDER.indexOf(activeStep) + 1} / {STEP_ORDER.length}
          </span>
          <button
            onClick={() => {
              const idx = STEP_ORDER.indexOf(activeStep);
              if (idx < STEP_ORDER.length - 1) setActiveStep(STEP_ORDER[idx + 1]);
            }}
            disabled={activeStep === STEP_ORDER[STEP_ORDER.length - 1]}
            className={cn(
              'px-4 py-2 text-sm rounded-lg font-medium transition-colors',
              activeStep === STEP_ORDER[STEP_ORDER.length - 1]
                ? 'text-slate-600 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white',
            )}
          >
            Next
          </button>
        </div>
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
