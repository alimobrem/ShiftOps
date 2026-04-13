import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { DrawerShell } from '../../components/primitives/DrawerShell';
import { useMonitorStore } from '../../store/monitorStore';
import type { ScannerCoverage } from '../../engine/analyticsApi';

const DISABLED_KEY = 'pulse-disabled-scanners';

interface ScannerDrawerProps {
  coverage: ScannerCoverage | null;
  onClose: () => void;
}

export function ScannerDrawer({ coverage, onClose }: ScannerDrawerProps) {
  const setDisabledBackend = useMonitorStore((s) => s.setDisabledScanners);

  const [disabled, setDisabled] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DISABLED_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const toggle = useCallback((id: string) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(DISABLED_KEY, JSON.stringify([...next]));
      setDisabledBackend([...next]);
      return next;
    });
  }, [setDisabledBackend]);

  const scanners = coverage?.per_scanner || [];
  const activeCount = scanners.filter((s) => !disabled.has(s.name)).length;

  return (
    <DrawerShell title="Scanner Coverage" onClose={onClose}>
      <div className="text-xs text-slate-500 mb-4">
        {activeCount}/{scanners.length} scanners active
      </div>

      <div className="space-y-1">
        {scanners.map((scanner) => {
          const isDisabled = disabled.has(scanner.name);
          return (
            <div
              key={scanner.name}
              className={cn(
                'flex items-center justify-between px-3 py-3 rounded-lg border transition-colors',
                isDisabled ? 'border-slate-800 opacity-50' : 'border-slate-800',
              )}
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-200 font-medium">
                  {scanner.name.replace(/^scan_/, '').replace(/_/g, ' ')}
                </div>
                {!isDisabled && scanner.finding_count > 0 && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {scanner.finding_count} findings ({scanner.actionable_count} actionable)
                    {scanner.noise_pct > 0 && ` \u00B7 ${scanner.noise_pct}% noise`}
                  </div>
                )}
                {!isDisabled && scanner.finding_count === 0 && (
                  <div className="text-xs text-slate-600 mt-0.5">No findings yet</div>
                )}
                {isDisabled && (
                  <div className="text-xs text-slate-600 mt-0.5">Disabled</div>
                )}
              </div>

              <button
                onClick={() => toggle(scanner.name)}
                role="switch"
                aria-checked={!isDisabled}
                aria-label={`${isDisabled ? 'Enable' : 'Disable'} ${scanner.name.replace(/_/g, ' ')} scanner`}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors shrink-0 ml-3',
                  isDisabled ? 'bg-slate-700' : 'bg-emerald-600',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  !isDisabled && 'translate-x-4',
                )} />
              </button>
            </div>
          );
        })}
        {scanners.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-8">No scanner data available</div>
        )}
      </div>
    </DrawerShell>
  );
}
