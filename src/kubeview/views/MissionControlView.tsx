import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, AlertTriangle } from 'lucide-react';
import {
  fetchFixHistorySummary,
  fetchScannerCoverage,
  fetchConfidenceCalibration,
  fetchAccuracyStats,
  fetchCostStats,
  fetchRecommendations,
  fetchReadinessSummary,
  fetchCapabilities,
  fetchAgentVersion,
} from '../engine/analyticsApi';
import { fetchAgentEvalStatus } from '../engine/evalStatus';
import { TrustPolicy } from './mission-control/TrustPolicy';
import { AgentHealth } from './mission-control/AgentHealth';
import { AgentAccuracy } from './mission-control/AgentAccuracy';
import { CapabilityDiscovery } from './mission-control/CapabilityDiscovery';
import { ScannerDrawer } from './mission-control/ScannerDrawer';
import { EvalDrawer } from './mission-control/EvalDrawer';
import { MemoryDrawer } from './mission-control/MemoryDrawer';

export default function MissionControlView() {
  const [drawerOpen, setDrawerOpen] = useState<'scanner' | 'eval' | 'memory' | null>(null);

  const evalQ = useQuery({
    queryKey: ['agent', 'eval-status'],
    queryFn: () => fetchAgentEvalStatus().catch(() => null),
    refetchInterval: 60_000,
  });

  const fixQ = useQuery({
    queryKey: ['agent', 'fix-history-summary'],
    queryFn: () => fetchFixHistorySummary().catch(() => null),
    staleTime: 60_000,
  });

  const coverageQ = useQuery({
    queryKey: ['agent', 'scanner-coverage'],
    queryFn: () => fetchScannerCoverage().catch(() => null),
    staleTime: 60_000,
  });

  const confidenceQ = useQuery({
    queryKey: ['agent', 'confidence'],
    queryFn: () => fetchConfidenceCalibration().catch(() => null),
    staleTime: 60_000,
  });

  const accuracyQ = useQuery({
    queryKey: ['agent', 'accuracy'],
    queryFn: () => fetchAccuracyStats().catch(() => null),
    staleTime: 60_000,
  });

  const costQ = useQuery({
    queryKey: ['agent', 'cost'],
    queryFn: () => fetchCostStats().catch(() => null),
    staleTime: 60_000,
  });

  const recsQ = useQuery({
    queryKey: ['agent', 'recommendations'],
    queryFn: () => fetchRecommendations().catch(() => null),
    staleTime: 5 * 60_000,
  });

  const readinessQ = useQuery({
    queryKey: ['agent', 'readiness-summary'],
    queryFn: () => fetchReadinessSummary().catch(() => null),
    staleTime: 60_000,
  });

  const { evalStatus, fixSummary, coverage, confidence, accuracy, costStats, recommendations, readiness } = {
    evalStatus: evalQ.data, fixSummary: fixQ.data, coverage: coverageQ.data,
    confidence: confidenceQ.data, accuracy: accuracyQ.data, costStats: costQ.data,
    recommendations: recsQ.data, readiness: readinessQ.data,
  };

  const anyError = [evalQ, fixQ, coverageQ, confidenceQ, accuracyQ, costQ, recsQ, readinessQ]
    .some((q) => q.isError);

  const { data: capabilities } = useQuery({
    queryKey: ['agent', 'capabilities'],
    queryFn: fetchCapabilities,
    staleTime: 60_000,
  });

  const { data: version } = useQuery({
    queryKey: ['agent', 'version'],
    queryFn: fetchAgentVersion,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-violet-400" />
          <h1 className="text-lg font-semibold text-slate-100">Mission Control</h1>
          {version && (
            <span className="text-xs text-slate-500">
              v{version.agent} &middot; Protocol v{version.protocol} &middot; {version.tools} tools
            </span>
          )}
        </div>

        {anyError && (
          <div className="flex items-center gap-2 text-xs text-amber-300/80 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/10">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Some analytics data is unavailable. Cards below may show partial information.</span>
          </div>
        )}

        <TrustPolicy
          maxTrustLevel={capabilities?.max_trust_level ?? 0}
          scannerCount={coverage?.active_scanners ?? 0}
          fixSummary={fixSummary ?? null}
        />

        <AgentHealth
          evalStatus={evalStatus}
          coverage={coverage ?? null}
          fixSummary={fixSummary ?? null}
          confidence={confidence ?? null}
          costStats={costStats ?? null}
          readiness={readiness ?? null}
          onOpenScannerDrawer={() => setDrawerOpen('scanner')}
          onOpenEvalDrawer={() => setDrawerOpen('eval')}
          onOpenMemoryDrawer={() => setDrawerOpen('memory')}
          memoryPatternCount={accuracy?.learning?.total_patterns ?? 0}
        />

        <AgentAccuracy
          accuracy={accuracy ?? null}
          onOpenMemoryDrawer={() => setDrawerOpen('memory')}
        />

        {recommendations?.recommendations && (
          <CapabilityDiscovery recommendations={recommendations.recommendations} />
        )}
      </div>

      {drawerOpen === 'scanner' && <ScannerDrawer coverage={coverage ?? null} onClose={() => setDrawerOpen(null)} />}
      {drawerOpen === 'eval' && <EvalDrawer evalStatus={evalStatus} onClose={() => setDrawerOpen(null)} />}
      {drawerOpen === 'memory' && <MemoryDrawer onClose={() => setDrawerOpen(null)} />}
    </div>
  );
}
