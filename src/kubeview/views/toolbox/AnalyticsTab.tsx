import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wrench, Database, AlertTriangle, Clock, Bot, Shield, Palette,
  ArrowRight, Puzzle, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { useToolUsageStore } from '../../store/toolUsageStore';
import { useVisibilityAwareInterval } from '../../hooks/useVisibilityAwareInterval';
import { safeQuery } from '../../engine/safeQuery';
import { fetchIntelligenceSections, fetchPromptStats } from '../../engine/analyticsApi';
import { SourceBadge } from './SourceBadge';
import { StatCard } from './StatCard';
import { SessionAnalyticsSection } from './SessionAnalyticsSection';
import { OrcaAnalyticsSection } from './OrcaAnalyticsSection';
import { PromptAuditSection } from './PromptAuditSection';
import { UnusedToolsSection } from './UnusedToolsSection';

const MODE_ICONS: Record<string, React.ReactNode> = {
  sre: <Bot className="w-4 h-4 text-violet-400" />,
  security: <Shield className="w-4 h-4 text-red-400" />,
  view_designer: <Palette className="w-4 h-4 text-emerald-400" />,
};

export function AnalyticsTab() {
  const { stats, statsLoading, loadStats, chains, chainsLoading, loadChains, tools, loadTools } = useToolUsageStore(useShallow((s) => ({
    stats: s.stats, statsLoading: s.statsLoading, loadStats: s.loadStats,
    chains: s.chains, chainsLoading: s.chainsLoading, loadChains: s.loadChains,
    tools: s.tools, loadTools: s.loadTools,
  })));

  const { data: intelligence } = useQuery({
    queryKey: ['analytics', 'intelligence'],
    queryFn: () => safeQuery(() => fetchIntelligenceSections()),
    staleTime: 60_000,
  });

  const { data: promptAnalytics } = useQuery({
    queryKey: ['analytics', 'prompt'],
    queryFn: () => safeQuery(() => fetchPromptStats()),
    staleTime: 60_000,
  });

  const { data: skillStats, isLoading: skillStatsLoading } = useQuery({
    queryKey: ['admin', 'skill-usage'],
    queryFn: async () => {
      const res = await fetch('/api/agent/skills/usage?days=30');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30_000,
  });

  useEffect(() => { loadStats(); loadChains(); loadTools(); }, [loadStats, loadChains, loadTools]);
  const refreshAnalytics = useCallback(() => { loadStats(); loadChains(); }, [loadStats, loadChains]);
  useVisibilityAwareInterval(refreshAnalytics, 10000);

  if (statsLoading && !stats) {
    return <div className="flex justify-center py-12"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>;
  }

  if (!stats || stats.total_calls === 0) {
    return (
      <div className="space-y-6">
        <OrcaAnalyticsSection />
        <div className="text-center py-8 text-sm text-slate-500">No tool usage data yet. Tool call analytics will appear once the agent handles conversations.</div>
      </div>
    );
  }

  const byTool = stats.by_tool || [];
  const maxCount = Math.max(...byTool.slice(0, 10).map((t) => t.count), 1);
  const rawBySource = (stats as unknown as { by_source?: Record<string, number> | Array<{ source: string; count: number }> }).by_source;
  const bySource = rawBySource
    ? Array.isArray(rawBySource)
      ? rawBySource
      : Object.entries(rawBySource).map(([source, count]) => ({ source, count }))
    : [];

  const skills = skillStats?.skills || [];
  const handoffs = skillStats?.handoffs || [];

  return (
    <div className="space-y-6">
      <SessionAnalyticsSection />

      <OrcaAnalyticsSection />

      {/* Skill Routing */}
      {!skillStatsLoading && skills.length > 0 && (
        <>
          <div className="border-t border-slate-800 pt-6">
            <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
              <Puzzle className="w-4 h-4 text-violet-400" />
              Skill Routing (30 days)
            </h2>
            <p className="text-[11px] text-slate-500 mb-4">Multi-signal selector routes each query to the best skill using keyword, taxonomy, component, historical, and temporal channels.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {skills.map((skill: Record<string, unknown>) => (
              <div key={String(skill.name)} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">{String(skill.name)}</span>
                  <span className="text-lg font-bold text-slate-100">{Number(skill.invocations)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>avg {Number(skill.avg_tools)} tools</span>
                  <span>{Number(skill.avg_duration_ms)}ms avg</span>
                  {(Number(skill.feedback_positive) > 0 || (skill.feedback_negative as number) > 0) && (
                    <>
                      {Number(skill.feedback_positive) > 0 && <span className="text-emerald-400">{Number(skill.feedback_positive)} positive</span>}
                      {(skill.feedback_negative as number) > 0 && <span className="text-red-400">{Number(skill.feedback_negative)} negative</span>}
                    </>
                  )}
                </div>
                {(skill.top_tools as Array<{ name: string; count: number }>)?.length > 0 && (
                  <div className="text-[10px] text-slate-600">
                    Top: {(skill.top_tools as Array<{ name: string; count: number }>).map((t) => t.name).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>

          {handoffs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-slate-300 mb-1">Skill Handoffs</h3>
              <p className="text-[11px] text-slate-500 mb-3">When one skill routes a conversation to another mid-session.</p>
              <div className="space-y-1.5">
                {handoffs.map((h: { from: string; to: string; count: number }, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-300">{h.from}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-slate-300">{h.to}</span>
                    <span className="text-slate-500 ml-auto">{h.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tool Usage */}
      <div className="border-t border-slate-800 pt-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-fuchsia-400" />
          Tool Usage
        </h2>
        <p className="text-[11px] text-slate-500 mb-4">Raw tool invocation stats across all agent conversations.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Calls" value={stats.total_calls.toLocaleString()} icon={<Database className="w-4 h-4 text-blue-400" />} />
        <StatCard label="Unique Tools" value={String(stats.unique_tools_used)} icon={<Wrench className="w-4 h-4 text-fuchsia-400" />} />
        <StatCard label="Error Rate" value={`${(stats.error_rate * 100).toFixed(1)}%`} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} />
        <StatCard label="Avg Duration" value={`${stats.avg_duration_ms}ms`} icon={<Clock className="w-4 h-4 text-emerald-400" />} />
      </div>

      {/* Top tools + by mode/category/source */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-1">By Mode</h3>
          <div className="space-y-1">
            {(stats.by_mode || []).map((m) => (
              <div key={m.mode} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 capitalize flex items-center gap-1.5">
                  {MODE_ICONS[m.mode] || <Bot className="w-3 h-3 text-slate-500" />}
                  {m.mode}
                </span>
                <span className="text-slate-400">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-1">By Category</h3>
          <div className="space-y-1">
            {(stats.by_category || []).map((c) => (
              <div key={c.category} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{c.category}</span>
                <span className="text-slate-400">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-1">By Source</h3>
          {bySource && bySource.length > 0 ? (
            <div className="space-y-1">
              {bySource.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 flex items-center gap-1.5"><SourceBadge source={s.source} /></span>
                  <span className="text-slate-400">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500">No source data</div>
          )}
        </div>
      </div>

      {/* Top tools bar chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h3 className="text-xs font-medium text-slate-300 mb-3">Top Tools</h3>
        <div className="space-y-1.5">
          {byTool.slice(0, 10).map((t) => (
            <div key={t.tool_name} className="flex items-center gap-2 text-xs">
              <span className="w-36 truncate font-mono text-slate-300">{t.tool_name}</span>
              <div className="flex-1 h-4 bg-slate-800 rounded-sm overflow-hidden" role="meter" aria-label={`${t.tool_name}: ${t.count} calls`} aria-valuenow={t.count} aria-valuemin={0} aria-valuemax={maxCount}>
                <div className="h-full bg-blue-600/60 rounded-sm" style={{ width: `${(t.count / maxCount) * 100}%` }} />
              </div>
              <span className="w-10 text-right text-slate-400">{t.count}</span>
              {t.error_count > 0 && <span className="text-red-400 text-[10px]">{t.error_count} err</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Common Patterns */}
      {!chainsLoading && chains && chains.bigrams.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-1">Tool Chains</h3>
          <p className="text-[11px] text-slate-500 mb-3">Frequent tool-to-tool sequences — shows how the agent builds its reasoning.</p>
          <div className="space-y-1.5">
            {chains.bigrams.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-slate-300">{b.from_tool}</span>
                <ArrowRight className="w-3 h-3 text-slate-600" />
                <span className="font-mono text-slate-300">{b.to_tool}</span>
                <span className="text-slate-500 ml-auto">{b.frequency}x</span>
                <span className="text-blue-400">{Math.round(b.probability * 100)}%</span>
              </div>
            ))}
          </div>
          {chains.trigrams && chains.trigrams.length > 0 && (
            <>
              <h4 className="text-[11px] font-medium text-slate-400 mt-4 mb-2">3-Step Workflows</h4>
              <div className="space-y-1.5">
                {chains.trigrams.slice(0, 5).map((t: { sequence: string[]; frequency: number; probability: number }, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    {t.sequence.map((tool: string, j: number) => (
                      <span key={j} className="flex items-center gap-1.5">
                        {j > 0 && <ArrowRight className="w-3 h-3 text-slate-600" />}
                        <span className="font-mono text-slate-300">{tool}</span>
                      </span>
                    ))}
                    <span className="text-slate-500 ml-auto">{t.frequency}x</span>
                    <span className="text-violet-400">{Math.round(t.probability * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Unused Tools */}
      {tools && stats && <UnusedToolsSection tools={tools} usedTools={byTool} />}

      {/* Prompt & Token Efficiency */}
      {(promptAnalytics?.stats || intelligence?.token_trending || intelligence?.query_reliability) && (
        <div className="border-t border-slate-800 pt-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400" />
            Prompt & Token Efficiency
          </h2>
          <p className="text-[11px] text-slate-500 mb-4">System prompt performance, token costs, and PromQL query reliability.</p>
        </div>
      )}

      {/* Prompt Analytics */}
      {promptAnalytics?.stats && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-3">Prompt Size & Cache</h3>
          <div className="text-sm text-slate-200">
            Avg tokens: {promptAnalytics.stats.avg_tokens.toLocaleString()} &middot; Cache hit rate: {(promptAnalytics.stats.cache_hit_rate * 100).toFixed(0)}%
          </div>
          {Object.keys(promptAnalytics.stats.section_avg).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(promptAnalytics.stats.section_avg).map(([section, avg]) => (
                <div key={section} className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-slate-500 truncate">{section}</span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${Math.min((avg as number) / 100, 100)}%` }} />
                  </div>
                  <span className="w-12 text-right text-slate-500">{(avg as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Token Trending */}
      {intelligence?.token_trending && (intelligence.token_trending.input_delta_pct !== 0 || intelligence.token_trending.output_delta_pct !== 0 || intelligence.token_trending.cache_delta_pct !== 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-3">Token Trending (week-over-week)</h3>
          <div className="grid grid-cols-3 gap-4 text-center text-xs">
            <div>
              <div className="text-slate-400">Input</div>
              <div className={intelligence.token_trending.input_delta_pct > 0 ? 'text-red-400' : 'text-emerald-400'}>
                {intelligence.token_trending.input_delta_pct > 0 ? '+' : ''}{intelligence.token_trending.input_delta_pct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Output</div>
              <div className={intelligence.token_trending.output_delta_pct > 0 ? 'text-red-400' : 'text-emerald-400'}>
                {intelligence.token_trending.output_delta_pct > 0 ? '+' : ''}{intelligence.token_trending.output_delta_pct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Cache</div>
              <div className={intelligence.token_trending.cache_delta_pct > 0 ? 'text-emerald-400' : 'text-red-400'}>
                {intelligence.token_trending.cache_delta_pct > 0 ? '+' : ''}{intelligence.token_trending.cache_delta_pct.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PromQL Reliability */}
      {intelligence?.query_reliability && (intelligence.query_reliability.preferred.length > 0 || intelligence.query_reliability.unreliable.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-3">PromQL Reliability</h3>
          <div className="text-xs text-slate-400 mb-2">
            {intelligence.query_reliability.preferred.length} reliable &middot; {intelligence.query_reliability.unreliable.length} unreliable
          </div>
          {intelligence.query_reliability.unreliable.map((q) => (
            <div key={q.query} className="text-xs text-red-400/80 truncate">
              {q.query} &mdash; {(q.success_rate * 100).toFixed(0)}% success ({q.total} calls)
            </div>
          ))}
        </div>
      )}

      {/* Prompt Audit */}
      <PromptAuditSection />
    </div>
  );
}
