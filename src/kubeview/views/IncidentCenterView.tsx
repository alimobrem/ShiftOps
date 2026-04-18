import { useState, lazy, Suspense, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Siren, Zap, Clock, Bell, Settings, GitPullRequest, AlertTriangle,
  ChevronDown, ChevronUp, X, SlidersHorizontal, Loader2,
  ToggleLeft, ToggleRight, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useQuery } from '@tanstack/react-query';
import { useMonitorStore } from '../store/monitorStore';
import { useIncidentFeed } from '../hooks/useIncidentFeed';
import { fetchBriefing, type BriefingResponse } from '../engine/fixHistory';
import { fetchScannerCoverage } from '../engine/analyticsApi';
import { NowTab } from './incidents/NowTab';
import { ActivityTab } from './incidents/ActivityTab';

const AlertsView = lazy(() => import('./AlertsView'));
const ActionsTab = lazy(() => import('./incidents/ActionsTab').then(m => ({ default: m.ActionsTab })));

type IncidentTab = 'active' | 'approvals' | 'activity' | 'alerts';

const TABS = [
  { id: 'active' as IncidentTab, label: 'Active', icon: Zap, color: 'text-amber-400' },
  { id: 'approvals' as IncidentTab, label: 'Approvals', icon: GitPullRequest, color: 'text-violet-400' },
  { id: 'activity' as IncidentTab, label: 'Activity', icon: Clock, color: 'text-blue-400' },
  { id: 'alerts' as IncidentTab, label: 'Alerts', icon: Bell, color: 'text-red-400' },
] as const;

interface ScannerInfo {
  name: string;
  display_name: string;
  description: string;
  enabled: boolean;
}

function BriefingBanner({ briefing, onDismiss }: { briefing: BriefingResponse; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(true);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ChevronDown className="w-3.5 h-3.5" />
        {briefing.summary}
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{briefing.greeting}</h2>
          <p className="text-xs text-slate-400 mt-1">{briefing.summary}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(false)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors" title="Collapse">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDismiss} className="p-1 text-slate-500 hover:text-slate-300 transition-colors" title="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        {briefing.actions.completed > 0 && (
          <span className="text-emerald-400">{briefing.actions.completed} actions completed</span>
        )}
        {briefing.investigations > 0 && (
          <span className="text-violet-400">{briefing.investigations} investigations</span>
        )}
        {briefing.categoriesFixed.length > 0 && (
          <span className="text-slate-500">Fixed: {briefing.categoriesFixed.join(', ')}</span>
        )}
      </div>
    </div>
  );
}

function ScannerControlsPopover() {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerScan = useMonitorStore((s) => s.triggerScan);
  const setDisabledScanners = useMonitorStore((s) => s.setDisabledScanners);

  const { data: scanners = [], refetch: refetchScanners } = useQuery<ScannerInfo[]>({
    queryKey: ['scanners'],
    queryFn: async () => {
      const res = await fetch('/api/agent/monitor/scanners');
      if (!res.ok) return [];
      const data = await res.json();
      return data.scanners ?? [];
    },
    staleTime: 30_000,
    enabled: open,
  });

  const { data: coverage } = useQuery({
    queryKey: ['scanner-coverage'],
    queryFn: () => fetchScannerCoverage(7),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = (scannerName: string) => {
    const disabled = scanners.filter((s) => !s.enabled).map((s) => s.name);
    const scanner = scanners.find((s) => s.name === scannerName);
    if (!scanner) return;
    const newDisabled = scanner.enabled
      ? [...disabled, scannerName]
      : disabled.filter((n) => n !== scannerName);
    setDisabledScanners(newDisabled);
    refetchScanners();
  };

  const handleScanNow = () => {
    setScanning(true);
    triggerScan();
    setTimeout(() => setScanning(false), 3000);
  };

  const scannerStats = (coverage as { scanners?: Array<{ name: string; findings_count: number }> })?.scanners;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
        title="Scanner Controls"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Scanner Controls</h3>
            <button
              onClick={handleScanNow}
              disabled={scanning}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {scanning ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>
          <div className="max-h-72 overflow-auto divide-y divide-slate-800">
            {scanners.map((scanner) => {
              const stats = scannerStats?.find((s) => s.name === scanner.name);
              return (
                <div key={scanner.name} className="px-4 py-2.5 flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(scanner.name)}
                    className="shrink-0"
                    title={scanner.enabled ? 'Disable' : 'Enable'}
                  >
                    {scanner.enabled ? (
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-600" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{scanner.display_name || scanner.name}</div>
                    {scanner.description && (
                      <div className="text-[10px] text-slate-500 truncate">{scanner.description}</div>
                    )}
                  </div>
                  {stats && stats.findings_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded shrink-0">
                      {stats.findings_count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentCenterView() {
  const urlTab = new URLSearchParams(window.location.search).get('tab') as IncidentTab | null;
  const [activeTab, setActiveTabState] = useState<IncidentTab>(
    urlTab && ['active', 'approvals', 'activity', 'alerts'].includes(urlTab) ? urlTab : 'active',
  );
  const setActiveTab = (tab: IncidentTab) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'active') params.delete('tab'); else params.set('tab', tab);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };
  const navigate = useNavigate();
  const { connected, connectionError, findingsCount, pendingCount } = useMonitorStore(
    useShallow((s) => ({
      connected: s.connected,
      connectionError: s.connectionError,
      findingsCount: s.findings.length,
      pendingCount: s.pendingActions.length,
    })),
  );
  const { counts: alertCounts } = useIncidentFeed({ sources: ['prometheus-alert'] });
  const firingAlertCount = alertCounts.total;

  // Briefing banner
  const [briefingDismissed, setBriefingDismissed] = useState(
    () => sessionStorage.getItem('pulse-briefing-dismissed') === '1',
  );
  const { data: briefing } = useQuery({
    queryKey: ['briefing'],
    queryFn: () => fetchBriefing(12),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: !briefingDismissed,
  });
  const handleDismissBriefing = () => {
    setBriefingDismissed(true);
    sessionStorage.setItem('pulse-briefing-dismissed', '1');
  };

  const badgeCounts = useMemo<Partial<Record<IncidentTab, number>>>(() => {
    const map: Partial<Record<IncidentTab, number>> = {};
    if (findingsCount > 0) map.active = findingsCount;
    if (pendingCount > 0) map.approvals = pendingCount;
    if (firingAlertCount > 0) map.alerts = firingAlertCount;
    return map;
  }, [findingsCount, pendingCount, firingAlertCount]);


  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Siren className="w-6 h-6 text-violet-500" />
              Incident Center
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time incidents, correlation analysis, and automated remediation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border',
                connected
                  ? 'bg-green-900/30 border-green-800'
                  : 'bg-slate-900 border-slate-700',
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  connected ? 'bg-green-400 animate-pulse' : 'bg-slate-500',
                )}
              />
              <span className={cn('text-sm font-medium', connected ? 'text-green-300' : 'text-slate-400')}>
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>
            <ScannerControlsPopover />
            <button
              onClick={() => navigate('/agent')}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
              title="Pulse Agent"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Briefing banner */}
        {!briefingDismissed && briefing && (
          <BriefingBanner briefing={briefing} onDismiss={handleDismissBriefing} />
        )}

        {/* Tabs */}
        <div
          className="flex gap-1 bg-slate-900 rounded-lg p-1"
          role="tablist"
          aria-label="Incident Center tabs"
          onKeyDown={(e) => {
            const ids = TABS.map((t) => t.id);
            const idx = ids.indexOf(activeTab);
            if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(ids[(idx + 1) % ids.length]); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveTab(ids[(idx - 1 + ids.length) % ids.length]); }
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`incident-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-xs rounded-md transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                activeTab === tab.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <tab.icon className={cn('w-3.5 h-3.5', activeTab !== tab.id && tab.color)} />
              {tab.label}
              {badgeCounts[tab.id] != null && (
                <span
                  className={cn(
                    'text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full',
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : tab.id === 'active'
                        ? 'bg-amber-500/20 text-amber-300'
                        : tab.id === 'alerts'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-violet-500/20 text-violet-300',
                  )}
                >
                  {badgeCounts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Connection error banner */}
        {connectionError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-950/50 border border-red-800 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{connectionError}</span>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'active' && <div id="incident-panel-active" role="tabpanel"><NowTab /></div>}
        {activeTab === 'approvals' && (
          <div id="incident-panel-approvals" role="tabpanel">
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>}>
              <ActionsTab />
            </Suspense>
          </div>
        )}
        {activeTab === 'activity' && <div id="incident-panel-activity" role="tabpanel"><ActivityTab /></div>}
        {activeTab === 'alerts' && (
          <div id="incident-panel-alerts" role="tabpanel">
            <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>}>
              <AlertsView />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
