import React, { useState, useMemo } from 'react';
import {
  Clock, Search, ChevronDown, ChevronRight, Info,
  AlertTriangle, CheckCircle, XCircle, Activity,
  RefreshCw, Settings, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../components/primitives/Card';
import { EmptyState } from '../../components/primitives/EmptyState';
import { useIncidentTimeline, type TimeRange } from '../../hooks/useIncidentTimeline';
import { useMonitorStore } from '../../store/monitorStore';
import { useUIStore } from '../../store/uiStore';
import { useNavigateTab } from '../../hooks/useNavigateTab';
import { resourceDetailUrl } from '../../engine/gvr';
import type { TimelineEntry, TimelineCategory } from '../../engine/types/timeline';

const TIME_RANGES: TimeRange[] = ['15m', '1h', '6h', '24h', '3d', '7d'];

const CATEGORY_CONFIG: Record<TimelineCategory, { label: string; icon: React.ElementType; color: string }> = {
  alert: { label: 'Alerts', icon: Bell, color: 'text-red-400' },
  event: { label: 'Events', icon: Activity, color: 'text-blue-400' },
  rollout: { label: 'Rollouts', icon: RefreshCw, color: 'text-emerald-400' },
  config: { label: 'Config', icon: Settings, color: 'text-amber-400' },
};

function getDateKey(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (eventDate.getTime() === today.getTime()) return 'Today';
  if (eventDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function HistoryTab() {
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const nsFilter = selectedNamespace !== '*' ? selectedNamespace : undefined;
  const fixHistory = useMonitorStore((s) => s.fixHistory);

  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategories, setActiveCategories] = useState<Set<TimelineCategory>>(
    () => new Set<TimelineCategory>(['alert', 'event', 'rollout', 'config']),
  );

  const toggleCategory = (cat: TimelineCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const timeline = useIncidentTimeline({ timeRange, namespace: nsFilter, categories: activeCategories });
  const entries = timeline.entries || [];
  const counts = timeline.counts || { alert: 0, event: 0, rollout: 0, config: 0 };

  // H8: Map fix history actions into timeline entries and merge with cluster events
  const mergedEntries = useMemo(() => {
    let all = [...entries];

    // Merge fix history records as timeline entries
    for (const action of fixHistory) {
      all.push({
        id: action.id,
        timestamp: action.timestamp,
        category: 'event' as TimelineCategory,
        severity: action.status === 'failed' ? 'warning' : 'normal',
        title: `Fix: ${action.tool || action.category} — ${action.status}`,
        detail: action.reasoning || action.afterState || undefined,
        namespace: action.resources?.[0]?.namespace,
        resource: action.resources?.[0]
          ? {
              kind: action.resources[0].kind,
              name: action.resources[0].name,
              namespace: action.resources[0].namespace,
              apiVersion: 'v1',
            }
          : undefined,
      });
    }

    // Sort merged entries by timestamp descending
    all.sort((a, b) => b.timestamp - a.timestamp);

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      all = all.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.detail || '').toLowerCase().includes(q) ||
          (e.namespace || '').toLowerCase().includes(q),
      );
    }

    return all;
  }, [entries, fixHistory, searchQuery]);

  // Group by date
  const groupedEntries = useMemo(() => {
    const groups: Record<string, TimelineEntry[]> = {};
    for (const entry of mergedEntries) {
      const dateKey = getDateKey(new Date(entry.timestamp));
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    }
    return groups;
  }, [mergedEntries]);

  const handleEntryClick = (entry: TimelineEntry) => {
    if (entry.resource) {
      const path = resourceDetailUrl({
        apiVersion: entry.resource.apiVersion,
        kind: entry.resource.kind,
        metadata: { name: entry.resource.name, namespace: entry.resource.namespace },
      });
      go(path, entry.resource.name);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time range */}
        <Card className="flex gap-1 p-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1.5 text-xs rounded transition-colors',
                timeRange === range ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {range}
            </button>
          ))}
        </Card>

        {/* Category toggles */}
        <Card className="flex gap-1 p-1">
          {(Object.entries(CATEGORY_CONFIG) as [TimelineCategory, typeof CATEGORY_CONFIG.alert][]).map(
            ([cat, cfg]) => {
              const Icon = cfg.icon;
              const active = activeCategories.has(cat);
              const count = counts[cat];
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
                    active ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-400',
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5', active ? cfg.color : 'text-slate-600')} />
                  {cfg.label}
                  {count > 0 && <span className="text-xs opacity-60">{count}</span>}
                </button>
              );
            },
          )}
        </Card>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter events..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{mergedEntries.length} entries</span>
        {fixHistory.length > 0 && (
          <>
            <span>-</span>
            <span>{fixHistory.length} fix actions on record</span>
          </>
        )}
      </div>

      {/* Chronological stream */}
      {timeline.isLoading ? (
        <div className="flex items-center justify-center h-48">
          <span className="text-slate-500 text-sm">Loading history...</span>
        </div>
      ) : mergedEntries.length === 0 ? (
        <EmptyState
          icon={<Info className="w-8 h-8" />}
          title="No history entries"
          description="Adjust the time range or enable more categories to see cluster history."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([dateKey, dateEntries]) => (
            <div key={dateKey}>
              <div className="sticky top-0 z-10 bg-slate-950 py-2 mb-3">
                <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">{dateKey}</h2>
              </div>
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-3">
                {dateEntries.map((entry) => (
                  <HistoryEntryCard key={entry.id} entry={entry} onClick={() => handleEntryClick(entry)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mergedEntries.length >= 500 && (
        <div className="text-center py-4">
          <p className="text-xs text-slate-500">Showing first 500 events. Narrow the time range for more detail.</p>
        </div>
      )}
    </div>
  );
}

function HistoryEntryCard({ entry, onClick }: { entry: TimelineEntry; onClick: () => void }) {
  const cfg = CATEGORY_CONFIG[entry.category];
  const Icon = cfg.icon;
  const hasResource = !!entry.resource;

  const severityDot: Record<string, string> = {
    critical: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
    normal: 'bg-slate-500',
  };

  return (
    <div
      className={cn(
        'relative bg-slate-900 rounded-lg border border-slate-800 p-4',
        hasResource && 'cursor-pointer hover:border-slate-700 transition-colors',
      )}
      role={hasResource ? 'button' : undefined}
      tabIndex={hasResource ? 0 : undefined}
      onClick={hasResource ? onClick : undefined}
      onKeyDown={hasResource ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {/* Timeline dot */}
      <div className={cn('absolute -left-[25px] top-5 w-3 h-3 rounded-full border-2 border-slate-950', severityDot[entry.severity] || 'bg-slate-500')} />

      <div className="flex items-start gap-3">
        <div className={cn('flex-shrink-0 mt-0.5', cfg.color)}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500">
              {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span
              className={cn('px-1.5 py-0.5 text-xs rounded', {
                'bg-red-900/50 text-red-300': entry.severity === 'critical',
                'bg-amber-900/50 text-amber-300': entry.severity === 'warning',
                'bg-blue-900/50 text-blue-300': entry.severity === 'info',
                'bg-slate-800 text-slate-400': entry.severity === 'normal',
              })}
            >
              {cfg.label}
            </span>
            {entry.namespace && <span className="text-xs text-slate-600">{entry.namespace}</span>}
          </div>

          {entry.resource && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-slate-500">{entry.resource.kind}</span>
              <span className="text-sm font-medium text-blue-400">{entry.resource.name}</span>
            </div>
          )}

          <div className="text-sm font-medium text-slate-200">{entry.title}</div>
          {entry.detail && <div className="text-sm text-slate-400 mt-0.5 line-clamp-2">{entry.detail}</div>}
        </div>
      </div>
    </div>
  );
}
