import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCostTrend } from '../../engine/mockData/pulseMocks';

const WIDTH = 120;
const HEIGHT = 32;
const PADDING = 2;

export function CostTrendSparkline({ className }: { className?: string }) {
  const trend = getCostTrend();
  const { dataPoints, changePercent, direction } = trend;

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min || 1;

  const points = dataPoints.map((v, i) => {
    const x = PADDING + (i / (dataPoints.length - 1)) * (WIDTH - PADDING * 2);
    const y = PADDING + (1 - (v - min) / range) * (HEIGHT - PADDING * 2);
    return `${x},${y}`;
  });

  const strokeColor =
    direction === 'down' ? '#34d399' : direction === 'up' ? '#f59e0b' : '#94a3b8';

  const TrendIcon =
    direction === 'down' ? TrendingDown : direction === 'up' ? TrendingUp : Minus;

  const trendColorClass =
    direction === 'down'
      ? 'text-emerald-400'
      : direction === 'up'
        ? 'text-amber-400'
        : 'text-slate-400';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg width={WIDTH} height={HEIGHT} className="shrink-0" role="img" aria-label="Cost trend sparkline">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center gap-1">
        <TrendIcon className={cn('h-4 w-4', trendColorClass)} />
        <span className={cn('text-sm font-medium', trendColorClass)}>
          {changePercent > 0 ? '+' : ''}{changePercent}%
        </span>
      </div>
      <span className="ml-auto text-[10px] text-slate-600 italic">Sample data</span>
    </div>
  );
}
