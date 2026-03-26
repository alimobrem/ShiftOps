import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface LastUpdatedProps {
  timestamp: number;
  className?: string;
}

/** Returns the earliest non-zero dataUpdatedAt from a set of queries, or 0 if none have data. */
export function earliestDataUpdatedAt(queries: Array<{ dataUpdatedAt: number }>): number {
  const timestamps = queries.map((q) => q.dataUpdatedAt).filter((t) => t > 0);
  return timestamps.length > 0 ? Math.min(...timestamps) : 0;
}

export function LastUpdated({ timestamp, className }: LastUpdatedProps) {
  const queryClient = useQueryClient();
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['k8s'] });
  };

  if (!timestamp) return null;

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-slate-500', className)}>
      <span data-testid="last-updated-text">Updated {formatTimeAgo(timestamp)}</span>
      <button
        onClick={handleRefresh}
        className="p-0.5 rounded hover:bg-slate-800 hover:text-slate-300 transition-colors"
        title="Refresh data"
        data-testid="refresh-button"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
}
