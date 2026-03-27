import React from 'react';
import { cn } from '@/lib/utils';
import type { CategoryResult } from './types';

interface ReadinessScoreProps {
  score: number;
  categories: CategoryResult[];
  className?: string;
}

/** Circular progress ring + per-category horizontal bars. */
export function ReadinessScore({ score, categories, className }: ReadinessScoreProps) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const scoreColor =
    score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const strokeColor =
    score >= 80 ? 'stroke-emerald-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-red-500';

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      {/* Circular gauge */}
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="8"
            className="stroke-slate-800"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn('transition-all duration-700', strokeColor)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-bold', scoreColor)}>{score}</span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>

      {/* Category bars */}
      <div className="w-full space-y-2">
        {categories.map((cat) => {
          const total = cat.gates.length;
          const passed = cat.gates.filter(
            (g) => g.status === 'pass' || g.status === 'waived',
          ).length;
          const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

          return (
            <div key={cat.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{cat.label}</span>
                <span className="text-slate-500">
                  {passed}/{total}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    pct === 100
                      ? 'bg-emerald-500'
                      : pct >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
