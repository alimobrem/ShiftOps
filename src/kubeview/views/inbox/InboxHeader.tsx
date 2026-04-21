import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { useInboxStore } from '../../store/inboxStore';

type Preset = 'active_incidents' | 'needs_approval' | 'my_items' | 'unclaimed';

const PRESETS: Array<{ id: Preset; label: string; countKey: string }> = [
  { id: 'active_incidents', label: 'Active Incidents', countKey: 'investigating' },
  { id: 'needs_approval', label: 'Needs Approval', countKey: 'pending_approval' },
  { id: 'my_items', label: 'My Items', countKey: 'claimed' },
  { id: 'unclaimed', label: 'Unclaimed', countKey: 'unclaimed' },
];

const SEVERITY_BADGES: Array<{ key: string; label: string; color: string }> = [
  { key: 'critical', label: 'Critical', color: 'bg-red-500/15 text-red-400' },
  { key: 'warning', label: 'Warning', color: 'bg-yellow-500/15 text-yellow-400' },
  { key: 'info', label: 'Info', color: 'bg-blue-500/15 text-blue-400' },
];

export function InboxHeader({
  onNewTask,
}: {
  onNewTask: () => void;
}) {
  const stats = useInboxStore((s) => s.stats);
  const activePreset = useInboxStore((s) => s.activePreset);
  const setPreset = useInboxStore((s) => s.setPreset);

  const newCount = stats.new ?? 0;
  const totalOpen = (stats.total ?? 0) - (stats.resolved ?? 0) - (stats.archived ?? 0);

  const hasSeverityData = SEVERITY_BADGES.some((s) => (stats[s.key] ?? 0) > 0);

  return (
    <div className="px-4 py-3 border-b border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-200">Inbox</h1>
          {newCount > 0 && (
            <Badge variant="default" className="bg-violet-600 text-white text-xs">
              {newCount} new
            </Badge>
          )}
          {totalOpen > 0 && (
            <span className="text-xs text-slate-500">{totalOpen} open</span>
          )}
          {hasSeverityData && (
            <div className="flex items-center gap-1.5 ml-2">
              {SEVERITY_BADGES.map((sev) => {
                const count = stats[sev.key] ?? 0;
                if (count === 0) return null;
                return (
                  <span key={sev.key} className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sev.color)}>
                    {count} {sev.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <Button size="sm" onClick={onNewTask}>
          <Plus className="w-4 h-4 mr-1" />
          New Task
        </Button>
      </div>

      <div className="flex items-center gap-2" role="group" aria-label="Quick filters">
        {PRESETS.map((preset) => {
          const count = stats[preset.countKey] ?? 0;
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setPreset(isActive ? null : preset.id)}
              aria-pressed={isActive}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full transition-colors inline-flex items-center gap-1.5',
                isActive
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300',
              )}
            >
              {preset.label}
              {count > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none',
                  isActive ? 'bg-white/20' : 'bg-slate-700 text-slate-300',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
