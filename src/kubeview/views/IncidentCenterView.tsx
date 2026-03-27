import { useState } from 'react';
import {
  Siren, Zap, Search, Wrench, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMonitorStore } from '../store/monitorStore';
import { NowTab } from './incidents/NowTab';
import { InvestigateTab } from './incidents/InvestigateTab';
import { ActionsTab } from './incidents/ActionsTab';
import { HistoryTab } from './incidents/HistoryTab';

type IncidentTab = 'now' | 'investigate' | 'actions' | 'history';

const TABS = [
  { id: 'now' as IncidentTab, label: 'Now', icon: Zap },
  { id: 'investigate' as IncidentTab, label: 'Investigate', icon: Search },
  { id: 'actions' as IncidentTab, label: 'Actions', icon: Wrench },
  { id: 'history' as IncidentTab, label: 'History', icon: Clock },
] as const;

export default function IncidentCenterView() {
  const [activeTab, setActiveTab] = useState<IncidentTab>('now');
  const connected = useMonitorStore((s) => s.connected);
  const pendingCount = useMonitorStore((s) => s.pendingActions.length);

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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 rounded-lg p-1" role="tablist" aria-label="Incident Center tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-xs rounded-md transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                activeTab === tab.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'actions' && pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded-full leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'now' && <NowTab />}
        {activeTab === 'investigate' && <InvestigateTab />}
        {activeTab === 'actions' && <ActionsTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
