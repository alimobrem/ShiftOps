import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, AlertTriangle, CheckCircle, XCircle, AlertOctagon, Activity, PauseCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchFixHistorySummary,
  fetchScannerCoverage,
  fetchConfidenceCalibration,
  fetchAccuracyStats,
  fetchCostStats,
  fetchRecommendations,
  fetchReadinessSummary,
  fetchCapabilities,
  fetchAgentHealth,
  type AgentHealthStatus,
} from '../../engine/analyticsApi';
import { fetchAgentEvalStatus } from '../../engine/evalStatus';
import { TrustPolicy } from '../mission-control/TrustPolicy';
import { AgentHealth } from '../mission-control/AgentHealth';
import { AgentAccuracy } from '../mission-control/AgentAccuracy';
import { CapabilityDiscovery } from '../mission-control/CapabilityDiscovery';
import { ScannerDrawer } from '../mission-control/ScannerDrawer';
import { EvalDrawer } from '../mission-control/EvalDrawer';
import { MemoryDrawer } from '../mission-control/MemoryDrawer';

const KPI_EXPLANATIONS: Record<string, string> = {
  mttd: 'Mean Time to Detect — how quickly issues are found. Target: <5min. If failing, check scanner interval or add more scanners.',
  mttr: 'Mean Time to Resolve — how quickly issues are fixed. Target: <15min. If failing, review auto-fix categories or trust level.',
  auto_fix_success: 'Auto-fix success rate — percentage of auto-fixes that resolved the issue. Target: >80%. If failing, review fix strategies in Toolbox.',
  false_positive_rate: 'False positive rate — findings that were noise. Target: <20%. If high, the monitor is generating noisy alerts.',
  selector_recall: 'Routing accuracy — correct skill selected for queries. Target: >90%. Low recall means queries go to wrong skills.',
  agent_incidents: 'Agent-caused incidents — issues created by auto-fix. Target: 0. Any non-zero value needs immediate review.',
  self_heal_rate: 'Self-heal rate — issues that resolved without intervention. High rate means the cluster is resilient.',
  ttr: 'Time to Resolution — end-to-end resolution time. Target: <30min for critical.',
  token_cost: 'Token cost per resolution — AI API cost efficiency. Lower is better.',
  routing_accuracy: 'ORCA routing accuracy — how often the right skill handles the query.',
};

export function OverviewTab() {
  const [drawerOpen, setDrawerOpen] = useState<'scanner' | 'eval' | 'memory' | null>(null);

  const evalQ = useQuery({
    queryKey: ['agent', 'eval-status'],
    queryFn: fetchAgentEvalStatus,
    refetchInterval: 60_000,
  });

  const fixQ = useQuery({
    queryKey: ['agent', 'fix-history-summary'],
    queryFn: () => fetchFixHistorySummary(),
    staleTime: 60_000,
  });

  const coverageQ = useQuery({
    queryKey: ['agent', 'scanner-coverage'],
    queryFn: () => fetchScannerCoverage(),
    staleTime: 60_000,
  });

  const confidenceQ = useQuery({
    queryKey: ['agent', 'confidence'],
    queryFn: () => fetchConfidenceCalibration(),
    staleTime: 60_000,
  });

  const accuracyQ = useQuery({
    queryKey: ['agent', 'accuracy'],
    queryFn: () => fetchAccuracyStats(),
    staleTime: 60_000,
  });

  const costQ = useQuery({
    queryKey: ['agent', 'cost'],
    queryFn: () => fetchCostStats(),
    staleTime: 60_000,
  });

  const recsQ = useQuery({
    queryKey: ['agent', 'recommendations'],
    queryFn: fetchRecommendations,
    staleTime: 5 * 60_000,
  });

  const readinessQ = useQuery({
    queryKey: ['agent', 'readiness-summary'],
    queryFn: () => fetchReadinessSummary(),
    staleTime: 60_000,
  });

  const capQ = useQuery({
    queryKey: ['agent', 'capabilities'],
    queryFn: fetchCapabilities,
    staleTime: 60_000,
  });

  const kpiQ = useQuery({
    queryKey: ['agent', 'kpi'],
    queryFn: async () => {
      const res = await fetch('/api/agent/kpi?days=7');
      if (!res.ok) throw new Error(`KPI fetch failed (${res.status})`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const healthQ = useQuery({
    queryKey: ['agent', 'health'],
    queryFn: fetchAgentHealth,
    refetchInterval: 30_000,
  });

  const dataQueries = [evalQ, fixQ, coverageQ, confidenceQ, accuracyQ, costQ, recsQ, readinessQ];
  const anyError = dataQueries.some((q) => q.isError);
  const anyLoading = dataQueries.every((q) => q.isLoading);

  return (
    <>
      <div className="space-y-6">
        {/* KPI Dashboard */}
        {kpiQ.data?.kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {Object.entries(kpiQ.data.kpis as Record<string, { label: string; value: number | string; unit: string; target: number | string | null; status: string; description?: string }>).map(([key, kpi]) => (
              <div key={key} title={KPI_EXPLANATIONS[key] || kpi.description || kpi.label} className={cn(
                'bg-slate-900 border rounded-lg p-2.5 text-center group relative',
                kpi.status === 'pass' ? 'border-emerald-800/30' :
                kpi.status === 'warn' ? 'border-amber-800/30' :
                kpi.status === 'fail' ? 'border-red-800/30' :
                'border-slate-800',
              )}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  {kpi.status === 'pass' ? <CheckCircle className="w-3 h-3 text-emerald-400" /> :
                   kpi.status === 'warn' ? <AlertTriangle className="w-3 h-3 text-amber-400" /> :
                   kpi.status === 'info' ? <Activity className="w-3 h-3 text-blue-400" /> :
                   <XCircle className="w-3 h-3 text-red-400" />}
                  <span className="text-[10px] text-slate-500 truncate">{kpi.label}</span>
                </div>
                <div className={cn(
                  'text-sm font-bold',
                  kpi.status === 'pass' ? 'text-emerald-400' :
                  kpi.status === 'warn' ? 'text-amber-400' :
                  kpi.status === 'fail' ? 'text-red-400' :
                  kpi.status === 'info' ? 'text-blue-400' :
                  'text-slate-200',
                )}>
                  {kpi.unit === 'ratio' ? `${Math.round((kpi.value as number) * 100)}%` :
                   kpi.unit === 'seconds' ? `${kpi.value}s` :
                   kpi.unit === 'ms' ? `${kpi.value}ms` :
                   kpi.unit === 'chars' ? `${Math.round((kpi.value as number) / 1000)}K` :
                   String(kpi.value)}
                </div>
                {kpi.description && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {kpi.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {anyError && (
          <div className="flex items-center gap-2 text-xs text-amber-300/80 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Some analytics data is unavailable. Cards below may show partial information.</span>
          </div>
        )}

        {healthQ.data && <AgentHealthCard health={healthQ.data} />}

        <AgentIntelligenceCard />

        <TrustPolicy
          maxTrustLevel={capQ.data?.max_trust_level ?? 0}
          scannerCount={coverageQ.data?.active_scanners ?? 0}
          fixSummary={fixQ.data ?? null}
          supportedAutoFixCategories={capQ.data?.supported_auto_fix_categories}
        />

        {!anyLoading && (
          <>
            <AgentHealth
              evalStatus={evalQ.data ?? null}
              coverage={coverageQ.data ?? null}
              fixSummary={fixQ.data ?? null}
              confidence={confidenceQ.data ?? null}
              costStats={costQ.data ?? null}
              readiness={readinessQ.data ?? null}
              onOpenScannerDrawer={() => setDrawerOpen('scanner')}
              onOpenEvalDrawer={() => setDrawerOpen('eval')}
              onOpenMemoryDrawer={() => setDrawerOpen('memory')}
              memoryPatternCount={accuracyQ.data?.learning?.total_patterns ?? 0}
            />

            <AgentAccuracy
              accuracy={accuracyQ.data ?? null}
              onOpenMemoryDrawer={() => setDrawerOpen('memory')}
            />

            {recsQ.data?.recommendations && (
              <CapabilityDiscovery recommendations={recsQ.data.recommendations} />
            )}
          </>
        )}
      </div>

      {drawerOpen === 'scanner' && <ScannerDrawer coverage={coverageQ.data ?? null} onClose={() => setDrawerOpen(null)} />}
      {drawerOpen === 'eval' && <EvalDrawer evalStatus={evalQ.data} onClose={() => setDrawerOpen(null)} />}
      {drawerOpen === 'memory' && <MemoryDrawer onClose={() => setDrawerOpen(null)} />}
    </>
  );
}

const CB_COLORS: Record<string, { dot: string; label: string }> = {
  closed: { dot: 'bg-emerald-400', label: 'text-emerald-400' },
  open: { dot: 'bg-red-400', label: 'text-red-400' },
  half_open: { dot: 'bg-amber-400', label: 'text-amber-400' },
};

function AgentHealthCard({ health }: { health: AgentHealthStatus }) {
  const cbState = health.circuit_breaker.state.toLowerCase();
  const cbColor = CB_COLORS[cbState] ?? CB_COLORS.closed;
  const investigationCount = Object.keys(health.investigations).length;
  const hasErrors = health.errors.total > 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
      <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={cn('inline-block w-2 h-2 rounded-full', cbColor.dot)} />
          <span className="text-slate-500">Circuit Breaker</span>
          <span className={cn('font-medium capitalize', cbColor.label)}>
            {cbState.replace('_', ' ')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <AlertOctagon className={cn('w-3.5 h-3.5', hasErrors ? 'text-amber-400' : 'text-slate-600')} />
          <span className="text-slate-500">Errors</span>
          <span className={cn('font-medium', hasErrors ? 'text-amber-400' : 'text-slate-300')}>
            {health.errors.total}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500">Investigations</span>
          <span className="font-medium text-slate-300">{investigationCount}</span>
        </div>

        {health.autofix_paused && (
          <div className="flex items-center gap-1.5 text-amber-400">
            <PauseCircle className="w-3.5 h-3.5" />
            <span className="font-medium">Autofix paused</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentIntelligenceCard() {
  const { data: learning } = useQuery({
    queryKey: ['agent', 'learning-mc'],
    queryFn: async () => {
      const res = await fetch('/api/agent/analytics/learning?days=7');
      if (!res.ok) throw new Error(`Learning fetch failed (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: fixStrategies } = useQuery({
    queryKey: ['agent', 'fix-strategies-mc'],
    queryFn: async () => {
      const res = await fetch('/api/agent/analytics/fix-strategies?days=30');
      if (!res.ok) throw new Error(`Fix strategies fetch failed (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const events = learning?.events ?? [];
  const strategies = fixStrategies?.strategies ?? [];

  if (events.length === 0 && strategies.length === 0) return null;

  const selectionSummary = events.find((e: Record<string, unknown>) => e.type === 'selection_summary');
  const routingDecisions = events.filter((e: Record<string, unknown>) => e.type === 'routing_decision');
  const postmortemCount = events.find((e: Record<string, unknown>) => e.type === 'postmortems_generated');
  const topStrategy = strategies[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
          Agent Intelligence
        </h3>
        <a href="/toolbox?tab=analytics" className="text-[10px] text-slate-500 hover:text-slate-300">
          Full analytics →
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {selectionSummary && (
          <div>
            <div className="text-slate-500 mb-0.5">Routing</div>
            <div className="text-slate-200">{String((selectionSummary as Record<string, unknown>).description).split(',')[0]}</div>
          </div>
        )}
        {postmortemCount && (
          <div>
            <div className="text-slate-500 mb-0.5">Postmortems</div>
            <div className="text-teal-400">{String((postmortemCount as Record<string, unknown>).description)}</div>
          </div>
        )}
        {topStrategy && (
          <div>
            <div className="text-slate-500 mb-0.5">Top Fix Strategy</div>
            <div className="text-slate-200">
              {topStrategy.tool}: {Math.round(topStrategy.success_rate * 100)}%
            </div>
          </div>
        )}
        {routingDecisions.length > 0 && (
          <div>
            <div className="text-slate-500 mb-0.5">Recent Routing</div>
            <div className="text-slate-200">{routingDecisions.length} decisions</div>
          </div>
        )}
      </div>
    </div>
  );
}
