import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Puzzle, Wrench, Server, Layers, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, BarChart3, ArrowRight, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ExtTab = 'skills' | 'mcp' | 'components' | 'analytics';

export default function AdminExtensionsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<ExtTab>((searchParams.get('tab') as ExtTab) || 'skills');

  const changeTab = (tab: ExtTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'skills') next.delete('tab'); else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const tabs: Array<{ id: ExtTab; label: string; icon: React.ReactNode }> = [
    { id: 'skills', label: 'Skills', icon: <Puzzle className="w-3.5 h-3.5 text-violet-400" /> },
    { id: 'mcp', label: 'MCP Servers', icon: <Server className="w-3.5 h-3.5 text-cyan-400" /> },
    { id: 'components', label: 'Components', icon: <Layers className="w-3.5 h-3.5 text-emerald-400" /> },
    { id: 'analytics', label: 'Skill Analytics', icon: <BarChart3 className="w-3.5 h-3.5 text-amber-400" /> },
  ];

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-violet-400" />
            Extensions
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage skills, MCP servers, and components</p>
        </div>

        <div className="flex gap-1 bg-slate-900 rounded-lg border border-slate-800 p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => changeTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors',
                activeTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'mcp' && <MCPTab />}
        {activeTab === 'components' && <ComponentsTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skills Tab                                                          */
/* ------------------------------------------------------------------ */

function SkillsTab() {
  const queryClient = useQueryClient();
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState('');

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['admin', 'skills'],
    queryFn: async () => {
      const res = await fetch('/api/agent/skills');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const reloadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/agent/admin/skills/reload', { method: 'POST' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'skills'] }),
  });

  const testRouting = async () => {
    if (!testQuery.trim()) return;
    // TODO: call /admin/skills/{name}/test when endpoint exists
    setTestResult(`Query "${testQuery}" would route to: (test endpoint not yet wired)`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{skills.length} skills loaded</span>
        <button
          onClick={() => reloadMutation.mutate()}
          disabled={reloadMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', reloadMutation.isPending && 'animate-spin')} />
          Reload Skills
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {skills.map((skill: Record<string, unknown>) => (
            <div key={String(skill.name)} className={cn(
              'bg-slate-900 border rounded-lg p-4 space-y-2',
              skill.degraded ? 'border-amber-800/50' : 'border-slate-800',
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {skill.degraded
                    ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                    : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span className="text-sm font-medium text-slate-100">{String(skill.name)}</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-500">v{Number(skill.version)}</span>
                </div>
                {Boolean(skill.write_tools) && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/30 text-amber-400 rounded border border-amber-800/30">write</span>
                )}
              </div>
              <p className="text-xs text-slate-400">{String(skill.description)}</p>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                <span>{(skill.keywords as string[])?.length || 0} keywords</span>
                <span>{(skill.categories as string[])?.length || 0} categories</span>
                <span>{Number(skill.prompt_length)} chars</span>
              </div>
              {Boolean(skill.degraded) && (
                <div className="text-[10px] text-amber-400">{String(skill.degraded_reason)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Routing tester */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h3 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
          <Play className="w-3.5 h-3.5 text-blue-400" />
          Test Routing
        </h3>
        <div className="flex gap-2">
          <input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && testRouting()}
            placeholder="Type a query to see which skill handles it..."
            className="flex-1 px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={testRouting} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md">Test</button>
        </div>
        {testResult && <div className="text-xs text-slate-400 mt-2">{testResult}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MCP Tab                                                             */
/* ------------------------------------------------------------------ */

function MCPTab() {
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ['admin', 'mcp'],
    queryFn: async () => {
      const res = await fetch('/api/agent/admin/mcp');
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">{connections.length} MCP servers configured</div>

      {connections.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center">
          <Server className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-2">No MCP servers connected</p>
          <p className="text-xs text-slate-500">MCP servers are configured per-skill via mcp.yaml files.</p>
          <p className="text-xs text-slate-500 mt-1">See the Skill Developer Guide for details.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn: Record<string, unknown>, i: number) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                {conn.connected ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-sm font-medium text-slate-100">{String(conn.name)}</span>
                <span className="text-[10px] text-slate-500">{String(conn.transport)}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{String(conn.url)}</div>
              {Boolean(conn.tools) && <div className="text-[10px] text-slate-500 mt-1">{(conn.tools as string[]).length} tools</div>}
              {Boolean(conn.error) && <div className="text-[10px] text-red-400 mt-1">{String(conn.error)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Components Tab                                                      */
/* ------------------------------------------------------------------ */

function ComponentsTab() {
  const { data: components, isLoading } = useQuery({
    queryKey: ['admin', 'components'],
    queryFn: async () => {
      const res = await fetch('/api/agent/components');
      if (!res.ok) return null;
      return res.json() as Promise<Record<string, { description: string; category: string; supports_mutations: string[]; is_container: boolean }>>;
    },
  });

  if (isLoading || !components) {
    return <div className="flex justify-center py-12"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>;
  }

  const categories = [...new Set(Object.values(components).map((c) => c.category))].sort();

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">{Object.keys(components).length} component kinds registered</div>

      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(components)
              .filter(([, c]) => c.category === cat)
              .map(([name, comp]) => (
                <div key={name} className="bg-slate-900/50 border border-slate-800/50 rounded-md px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-slate-200">{name}</span>
                    {comp.is_container && <span className="text-[10px] px-1 py-0.5 bg-blue-900/30 text-blue-400 rounded">container</span>}
                  </div>
                  <p className="text-[11px] text-slate-500">{comp.description}</p>
                  {comp.supports_mutations.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {comp.supports_mutations.map((m) => (
                        <span key={m} className="text-[9px] px-1 py-0.5 bg-slate-800 text-slate-500 rounded">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analytics Tab                                                       */
/* ------------------------------------------------------------------ */

function AnalyticsTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'skill-usage'],
    queryFn: async () => {
      const res = await fetch('/api/agent/skills/usage?days=30');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30_000,
  });

  if (isLoading || !stats) {
    return <div className="flex justify-center py-12"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>;
  }

  const skills = stats.skills || [];
  const handoffs = stats.handoffs || [];

  return (
    <div className="space-y-6">
      {skills.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">No skill usage data yet</div>
      ) : (
        <>
          {/* Per-skill cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {skills.map((skill: Record<string, unknown>) => (
              <div key={String(skill.name)} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">{String(skill.name)}</span>
                  <span className="text-lg font-bold text-slate-100">{Number(skill.invocations)}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>avg {Number(skill.avg_tools)} tools</span>
                  <span>{Number(skill.avg_duration_ms)}ms avg</span>
                  <span className="text-emerald-400">{Number(skill.feedback_positive)} positive</span>
                  {(skill.feedback_negative as number) > 0 && (
                    <span className="text-red-400">{Number(skill.feedback_negative)} negative</span>
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

          {/* Handoff flow */}
          {handoffs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-medium text-slate-300 mb-3">Skill Handoffs</h3>
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
    </div>
  );
}
