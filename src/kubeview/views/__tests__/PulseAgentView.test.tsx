// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

vi.mock('../../store/trustStore', () => ({
  useTrustStore: Object.assign(
    (selector: any) => selector({
      trustLevel: 2,
      autoFixCategories: ['crashloop'],
      communicationStyle: 'detailed',
      setTrustLevel: vi.fn(),
      setAutoFixCategories: vi.fn(),
      setCommunicationStyle: vi.fn(),
    }),
    { getState: () => ({ trustLevel: 2 }) },
  ),
  TRUST_LABELS: { 0: 'Observe', 1: 'Confirm', 2: 'Batch', 3: 'Bounded', 4: 'Autonomous' },
  TRUST_DESCRIPTIONS: { 0: 'Observe', 1: 'Confirm', 2: 'Batch', 3: 'Bounded', 4: 'Autonomous' },
}));

vi.mock('../../store/monitorStore', () => ({
  useMonitorStore: Object.assign(
    (selector: any) => selector({ connected: true, findings: [] }),
    { getState: () => ({ findings: [] }) },
  ),
}));

const mockAnalytics = {
  fetchFixHistorySummary: vi.fn().mockResolvedValue({ total_actions: 10, completed: 8, failed: 1, rolled_back: 1, success_rate: 0.8, rollback_rate: 0.1, avg_resolution_ms: 120000, by_category: [], trend: { current_week: 10, previous_week: 7, delta: 3 } }),
  fetchScannerCoverage: vi.fn().mockResolvedValue({ active_scanners: 12, total_scanners: 17, coverage_pct: 78, categories: [], per_scanner: [] }),
  fetchConfidenceCalibration: vi.fn().mockResolvedValue({ accuracy_pct: 92, rating: 'good', brier_score: 0.08, total_predictions: 45, buckets: [] }),
  fetchAccuracyStats: vi.fn().mockResolvedValue({ avg_quality_score: 0.82, quality_trend: { current: 0.82, previous: 0.74, delta: 0.08 }, anti_patterns: [], learning: { total_runbooks: 5, new_this_month: 1, runbook_success_rate: 0.9, total_patterns: 3, pattern_types: {} }, override_rate: { overrides: 1, total_proposed: 10, rate: 0.1 }, dimensions: {} }),
  fetchCostStats: vi.fn().mockResolvedValue({ avg_tokens_per_incident: 12000, trend: { current: 12000, previous: 14000, delta_pct: -14.3 }, by_mode: [], total_tokens: 0, total_incidents: 0 }),
  fetchRecommendations: vi.fn().mockResolvedValue({ recommendations: [{ type: 'scanner', title: 'Enable cert scanner', description: 'Detect expiring certs', action: { kind: 'enable_scanner', scanner: 'certs' } }] }),
  fetchReadinessSummary: vi.fn().mockResolvedValue({ total_gates: 30, passed: 28, failed: 1, attention: 1, pass_rate: 0.93, attention_items: [] }),
  fetchCapabilities: vi.fn().mockResolvedValue({ max_trust_level: 4 }),
  fetchAgentVersion: vi.fn().mockResolvedValue({ agent: '2.0.0', protocol: 2, tools: 111 }),
  fetchAgentHealth: vi.fn().mockResolvedValue({ status: 'ok', circuit_breaker: { state: 'closed', failure_count: 0, recovery_timeout: 60 }, errors: { total: 0, by_category: {}, recent: [] }, investigations: {}, autofix_paused: false }),
};

vi.mock('../../engine/analyticsApi', () => mockAnalytics);

vi.mock('../../engine/evalStatus', () => ({
  fetchAgentEvalStatus: vi.fn().mockResolvedValue({ quality_gate_passed: true, release: { average_overall: 0.85, dimension_averages: { safety: 0.9, relevance: 0.8 }, blocker_counts: { policy_violation: 0, hallucinated_tool: 0 }, gate_passed: true, scenario_count: 20 } }),
}));

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderView() {
  const PulseAgentView = (await import('../PulseAgentView')).default;
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/pulse-agent']}>
        <PulseAgentView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PulseAgentView', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders "Pulse Agent" page header', async () => {
    await renderView();
    expect(screen.getByText('Pulse Agent')).toBeDefined();
  });

  it('renders trust level selector', async () => {
    await renderView();
    expect(screen.getByText('Trust Level')).toBeDefined();
    expect(screen.getByText('Observe')).toBeDefined();
    expect(screen.getByText('Autonomous')).toBeDefined();
  });

  it('renders agent health section', async () => {
    await renderView();
    expect(await screen.findByText('Agent Health')).toBeDefined();
    expect(await screen.findByText('Quality Gate')).toBeDefined();
    expect(await screen.findByText('Coverage')).toBeDefined();
    expect(await screen.findByText('Outcomes')).toBeDefined();
  });

  it('renders agent accuracy section', async () => {
    await renderView();
    expect(await screen.findByText('Agent Accuracy')).toBeDefined();
  });

  it('displays version info when available', async () => {
    await renderView();
    expect(await screen.findByText(/v2\.0\.0/)).toBeDefined();
    expect(await screen.findByText(/111 tools/)).toBeDefined();
  });

  it('hides version info when not available', async () => {
    mockAnalytics.fetchAgentVersion.mockResolvedValueOnce(null);
    await renderView();
    expect(screen.getByText('Pulse Agent')).toBeDefined();
    expect(screen.queryByText(/v2\.0\.0/)).toBeNull();
  });

  it('renders capability discovery when recommendations exist', async () => {
    await renderView();
    expect(await screen.findByText('Enable cert scanner')).toBeDefined();
  });

  it('shows error banner when a query fails', async () => {
    mockAnalytics.fetchFixHistorySummary.mockRejectedValueOnce(new Error('fail'));
    await renderView();
    expect(await screen.findByText(/Some analytics data is unavailable/)).toBeDefined();
  });

  it('re-exports MissionControlView as default', async () => {
    const pulseModule = await import('../PulseAgentView');
    const mcModule = await import('../MissionControlView');
    expect(pulseModule.default).toBe(mcModule.default);
  });
});
