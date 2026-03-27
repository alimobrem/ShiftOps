import React from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '../components/primitives/SectionHeader';
import { ReadinessWizard } from '../components/onboarding/ReadinessWizard';
import { ReadinessChecklist } from '../components/onboarding/ReadinessChecklist';
import { buildStubReport } from '../components/onboarding/stubData';
import type { OnboardingMode, ReadinessReport } from '../components/onboarding/types';
import { computeScore } from '../components/onboarding/types';

const STORAGE_KEY = 'openshiftpulse:onboarding-completed';

function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function markOnboardingComplete() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* noop */
  }
}

/** Dual-mode view: wizard for first-run, checklist for returning users. */
export default function OnboardingView() {
  const [mode, setMode] = React.useState<OnboardingMode>(
    hasCompletedOnboarding() ? 'checklist' : 'wizard',
  );
  const [report, setReport] = React.useState<ReadinessReport | null>(null);

  // Simulate async evaluation
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setReport(buildStubReport());
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleWaive = React.useCallback((gateId: string, reason: string) => {
    setReport((prev) => {
      if (!prev) return prev;
      const categories = prev.categories.map((cat) => ({
        ...cat,
        gates: cat.gates.map((g) =>
          g.id === gateId ? { ...g, status: 'waived' as const, waiverReason: reason } : g,
        ),
      }));
      return { ...prev, categories, score: computeScore(categories) };
    });
  }, []);

  const handleReVerify = React.useCallback((gateId: string) => {
    // Stub: set to loading briefly then restore
    setReport((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: prev.categories.map((cat) => ({
          ...cat,
          gates: cat.gates.map((g) =>
            g.id === gateId ? { ...g, status: 'loading' as const } : g,
          ),
        })),
      };
    });
    // Simulate re-check completing after a moment
    setTimeout(() => {
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          categories: prev.categories.map((cat) => ({
            ...cat,
            gates: cat.gates.map((g) =>
              g.id === gateId && g.status === 'loading'
                ? { ...g, status: 'unknown' as const, evidence: { summary: 'Re-verification pending real engine', evaluatedAt: new Date().toISOString() } }
                : g,
            ),
          })),
        };
      });
    }, 1500);
  }, []);

  const switchToChecklist = React.useCallback(() => {
    markOnboardingComplete();
    setMode('checklist');
  }, []);

  const switchToWizard = React.useCallback(() => {
    setMode('wizard');
  }, []);

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <SectionHeader
          icon={<ClipboardCheck className="w-6 h-6 text-violet-400" />}
          title="Cluster Readiness"
          subtitle="Evaluate production readiness across 6 categories"
          actions={
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-800 p-0.5">
              <button
                onClick={switchToWizard}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  mode === 'wizard'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                Wizard
              </button>
              <button
                onClick={switchToChecklist}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-colors',
                  mode === 'checklist'
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                Checklist
              </button>
            </div>
          }
        />

        {!report ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
            <span className="ml-3 text-sm text-slate-400">Evaluating cluster readiness...</span>
          </div>
        ) : mode === 'wizard' ? (
          <ReadinessWizard
            report={report}
            onWaive={handleWaive}
            onReVerify={handleReVerify}
            onSwitchToChecklist={switchToChecklist}
          />
        ) : (
          <ReadinessChecklist
            report={report}
            onWaive={handleWaive}
            onReVerify={handleReVerify}
            onSwitchToWizard={switchToWizard}
          />
        )}
      </div>
    </div>
  );
}
