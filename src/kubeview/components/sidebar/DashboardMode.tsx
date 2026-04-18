import { useState, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentStore } from '../../store/agentStore';
import { useMonitorStore } from '../../store/monitorStore';
import { useUIStore } from '../../store/uiStore';
import { useSmartPrompts } from '../../hooks/useSmartPrompts';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { formatRelativeTime } from '../../engine/formatters';

export function DashboardMode() {
  const navigate = useNavigate();
  const setAISidebarMode = useUIStore((s) => s.setAISidebarMode);
  const status = useAgentStatus();
  const smartPrompts = useSmartPrompts();

  const investigations = useMonitorStore((s) => s.investigations);
  const recentActions = useMonitorStore((s) => s.recentActions);

  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: memorySummary } = useQuery({
    queryKey: ['memory-summary'],
    queryFn: async () => {
      const res = await fetch('/api/agent/memory/summary');
      if (!res.ok) return null;
      return res.json() as Promise<{ incidents_count: number; runbooks_count: number; patterns_count: number; avg_score: number }>;
    },
    staleTime: 60_000,
  });

  const handleSend = () => {
    if (!input.trim()) return;
    const { connectAndSend } = useAgentStore.getState();
    connectAndSend(input.trim());
    setInput('');
    setAISidebarMode('chat');
  };

  const handlePromptClick = (prompt: string) => {
    const { connectAndSend } = useAgentStore.getState();
    connectAndSend(prompt);
    setAISidebarMode('chat');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const StatusIcon = status.icon;

  const recentActivity = useMemo(
    () => [...investigations, ...recentActions]
      .filter((item) => ('tool' in item ? item.tool : item.category))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3),
    [investigations, recentActions],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto thin-scrollbar px-4 py-3 space-y-4">
        {/* Agent Status — clickable to Incident Center when findings exist */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50',
            status.findingsCount > 0 && 'cursor-pointer hover:bg-slate-800 transition-colors',
          )}
          onClick={status.findingsCount > 0 ? () => navigate('/incidents') : undefined}
          role={status.findingsCount > 0 ? 'button' : undefined}
        >
          <StatusIcon className={cn(
            'w-4 h-4 shrink-0', status.color,
            status.type === 'streaming' && 'animate-spin',
            status.type === 'investigating' && 'animate-pulse',
          )} />
          <span className={cn('text-xs font-medium', status.color)}>{status.text}</span>
        </div>

        {/* Quick Prompts — max 3, deduplicated */}
        {smartPrompts.length > 0 && (
          <div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Suggestions</h3>
            <div className="flex flex-wrap gap-1.5">
              {smartPrompts.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptClick(p.prompt)}
                  className="px-2.5 py-1.5 text-xs bg-violet-600/10 text-violet-300 border border-violet-700/30 rounded-lg hover:bg-violet-600/20 transition-colors text-left"
                >
                  {p.context}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Recent Activity</h3>
            <div className="space-y-1.5">
              {recentActivity.map((item) => (
                <div key={item.id} className="px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-300 truncate">
                      {'tool' in item ? item.tool : item.category}
                    </span>
                    <span className={cn(
                      'text-[10px] px-1 py-0.5 rounded',
                      'status' in item && item.status === 'completed' ? 'bg-emerald-900/40 text-emerald-300' :
                      'status' in item && item.status === 'failed' ? 'bg-red-900/40 text-red-300' :
                      'bg-slate-800 text-slate-400',
                    )}>
                      {'status' in item ? item.status : 'done'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600">{formatRelativeTime(item.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memory Highlights */}
        {memorySummary && (
          <button
            onClick={() => navigate('/memory')}
            className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800 transition-colors"
          >
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1">
              <Brain className="w-3 h-3" />
              Agent Memory
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">{memorySummary.runbooks_count} runbooks</span>
              <span className="text-slate-400">{memorySummary.patterns_count} patterns</span>
              {memorySummary.avg_score > 0 && (
                <span className="text-slate-400">{(memorySummary.avg_score * 100).toFixed(0)}% confidence</span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Chat input */}
      <div className="border-t border-slate-800 px-3 py-2.5 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Pulse anything..."
            rows={1}
            className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              'p-2 rounded-lg transition-colors shrink-0',
              input.trim()
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed',
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
