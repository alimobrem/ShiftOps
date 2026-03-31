import React from 'react';
import { Lightbulb, ArrowRight, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostTrendSparkline } from './CostTrendSparkline';
import { useIncidentFeed, type IncidentSeverity } from '../../hooks/useIncidentFeed';

const severityConfig: Record<IncidentSeverity, { icon: React.ReactNode; borderClass: string }> = {
  critical: {
    icon: <AlertCircle className="h-4 w-4 text-red-400" />,
    borderClass: 'border-red-500/30',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    borderClass: 'border-amber-500/30',
  },
  info: {
    icon: <Info className="h-4 w-4 text-blue-400" />,
    borderClass: 'border-slate-800',
  },
};

interface QuickAction {
  label: string;
  route: string;
  title: string;
}

const quickActions: QuickAction[] = [
  { label: 'View incidents', route: '/incidents', title: 'Incidents' },
  { label: 'Check readiness', route: '/onboarding', title: 'Onboarding' },
  { label: 'Review alerts', route: '/alerts', title: 'Alerts' },
];

export function InsightsRail({ className, onNavigate }: { className?: string; onNavigate?: (route: string, title: string) => void }) {
  const { incidents, isLoading } = useIncidentFeed({ limit: 3 });

  return (
    <aside className={cn('space-y-4', className)}>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">7-day Cost Trend</h3>
        <CostTrendSparkline />
      </div>

      {isLoading ? (
        <>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-4 animate-pulse">
              <div className="h-4 w-32 bg-slate-700 rounded mb-2" />
              <div className="h-3 w-full bg-slate-700 rounded" />
            </div>
          ))}
        </>
      ) : incidents.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-400" />
            <h4 className="text-sm font-medium text-slate-100">All clear</h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">No active incidents right now.</p>
        </div>
      ) : (
        incidents.map((inc) => {
          const cfg = severityConfig[inc.severity];
          return (
            <div
              key={inc.id}
              className={cn('rounded-lg border bg-slate-900 p-4', cfg.borderClass)}
            >
              <div className="flex items-center gap-2 mb-2">
                {cfg.icon}
                <h4 className="text-sm font-medium text-slate-100">{inc.title}</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{inc.detail}</p>
            </div>
          );
        })
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-yellow-400" />
          <h4 className="text-sm font-medium text-slate-100">Quick Actions</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((qa) => (
            <button
              key={qa.route}
              onClick={() => onNavigate?.(qa.route, qa.title)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:border-violet-500/50 hover:text-slate-100 transition-colors"
            >
              {qa.label}
              <ArrowRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
