import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToolUsageStore } from '../../store/toolUsageStore';
import type { ToolInfo } from '../../store/toolUsageStore';
import { ToolCard } from './ToolCard';
import { ToolDetailDrawer } from './ToolDetailDrawer';

interface McpToolInfo extends ToolInfo {
  source: string;
  mcp_server?: string;
}

type EnrichedTool = ToolInfo & { source: string; mcp_server?: string };

export function CatalogTab() {
  const { tools, toolsLoading, loadTools } = useToolUsageStore(useShallow((s) => ({
    tools: s.tools, toolsLoading: s.toolsLoading, loadTools: s.loadTools,
  })));
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedTool, setSelectedTool] = useState<EnrichedTool | null>(null);

  useEffect(() => { loadTools(); }, [loadTools]);

  const allTools = useMemo(() => {
    const result: EnrichedTool[] = [];
    if (!tools) return result;
    const seen = new Set<string>();
    for (const t of tools.sre) { seen.add(t.name); result.push({ ...t, source: (t as unknown as { source?: string }).source || 'native' }); }
    for (const t of tools.security) {
      if (!seen.has(t.name)) { seen.add(t.name); result.push({ ...t, source: (t as unknown as { source?: string }).source || 'native' }); }
    }
    const mcpTools = (tools as unknown as { mcp?: McpToolInfo[] }).mcp;
    if (mcpTools) {
      for (const t of mcpTools) {
        if (!seen.has(t.name)) { seen.add(t.name); result.push({ ...t, source: 'mcp', mcp_server: t.mcp_server }); }
      }
    }
    return result;
  }, [tools]);

  const filtered = allTools.filter((t) => {
    if (sourceFilter !== 'all' && t.source !== sourceFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const nativeCount = allTools.filter((t) => t.source === 'native').length;
  const mcpCount = allTools.filter((t) => t.source === 'mcp').length;
  const categories = [...new Set(filtered.map((t) => t.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            aria-label="Search tools"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          aria-label="Filter by source"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All sources ({allTools.length})</option>
          <option value="native">Native ({nativeCount})</option>
          <option value="mcp">MCP ({mcpCount})</option>
        </select>
        <span className="text-xs text-slate-500">{filtered.length} tools</span>
      </div>

      {/* Tool list by category */}
      {toolsLoading ? (
        <div className="flex justify-center py-12"><div className="kv-skeleton w-8 h-8 rounded-full" /></div>
      ) : (
        <div className="space-y-4">
          {[...categories.sort(), ...(filtered.some((t) => !t.category) ? ['uncategorized'] : [])].map((cat) => {
            const catTools = filtered.filter((t) => cat === 'uncategorized' ? !t.category : t.category === cat);
            if (catTools.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{cat}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {catTools.map((t) => (
                    <ToolCard key={t.name} tool={t} source={t.source} mcpServer={t.mcp_server} onClick={() => setSelectedTool(t)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTool && <ToolDetailDrawer tool={selectedTool} onClose={() => setSelectedTool(null)} />}
    </div>
  );
}
