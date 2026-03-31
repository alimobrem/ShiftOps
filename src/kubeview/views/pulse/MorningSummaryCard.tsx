import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Bot, ClipboardList, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchBriefing, type BriefingResponse } from '../../engine/fixHistory';
import { useMonitorStore } from '../../store/monitorStore';

export function MorningSummaryCard({ className }: { className?: string }) {
  const { data: briefing, isLoading, isError } = useQuery<BriefingResponse>({
    queryKey: ['briefing'],
    queryFn: () => fetchBriefing(12),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const pendingReviews = useMonitorStore((s) => s.pendingActions.length);

  if (isLoading) {
    return (
      <div
        className={cn(
          'relative rounded-lg border border-violet-500/30 bg-slate-900 p-5 overflow-hidden animate-pulse',
          className,
        )}
      >
        <div className="h-6 w-48 bg-slate-700 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="h-10 bg-slate-700 rounded" />
          <div className="h-10 bg-slate-700 rounded" />
          <div className="h-10 bg-slate-700 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-slate-700 rounded w-3/4" />
          <div className="h-4 bg-slate-700 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (isError || !briefing) {
    return (
      <div
        className={cn(
          'relative rounded-lg border border-slate-700 bg-slate-900 p-5 overflow-hidden',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-slate-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm">Unable to load briefing. Agent may be unavailable.</span>
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const highlights: string[] = [];
  if (briefing.summary) highlights.push(briefing.summary);
  if (briefing.categoriesFixed.length > 0) {
    highlights.push(
      `Agent addressed issues in: ${briefing.categoriesFixed.join(', ')}.`,
    );
  }
  if (briefing.investigations > 0) {
    highlights.push(
      `${briefing.investigations} investigation${briefing.investigations > 1 ? 's' : ''} conducted in the last ${briefing.hours}h.`,
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border border-violet-500/30 bg-slate-900 p-5 overflow-hidden',
        className,
      )}
    >
      <div className="pointer-events-none absolute -inset-px rounded-lg bg-violet-500/5" />

      <div className="relative flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-violet-400" />
        <h2 className="text-lg font-semibold text-slate-100">
          {briefing.greeting || greeting}
        </h2>
        <span className="text-sm text-slate-400 ml-auto">AI Briefing</span>
      </div>

      <div className="relative grid grid-cols-3 gap-4 mb-4">
        <StatItem
          icon={<Bot className="h-4 w-4 text-blue-400" />}
          label="Agent actions"
          value={String(briefing.actions.total)}
        />
        <StatItem
          icon={<Bot className="h-4 w-4 text-emerald-400" />}
          label="Completed"
          value={String(briefing.actions.completed)}
          valueClass={briefing.actions.failed > 0 ? undefined : 'text-emerald-400'}
        />
        <StatItem
          icon={<ClipboardList className="h-4 w-4 text-amber-400" />}
          label="Pending reviews"
          value={String(pendingReviews)}
          valueClass={pendingReviews > 0 ? 'text-amber-400' : undefined}
        />
      </div>

      <ul className="relative space-y-2">
        {highlights.map((h, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <div className={cn('text-base font-semibold text-slate-100', valueClass)}>
          {value}
        </div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}
