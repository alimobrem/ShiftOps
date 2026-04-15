import { useEffect, useState } from 'react';
import { Brain, Wrench, Cpu, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingIndicatorProps {
  thinkingText: string;
  streamingText: string;
  activeTools: string[];
  /** Compact mode for InlineAgent (no border glow, smaller) */
  compact?: boolean;
}

/**
 * Neural Pulse — a prominent, phase-aware thinking indicator.
 *
 * Phases:
 *   1. Thinking (no tools, no text yet)      → brain icon + animated border
 *   2. Using tools (activeTools > 0)          → tool pills + progress
 *   3. Generating (streamingText arriving)    → typing indicator
 */
export function ThinkingIndicator({
  thinkingText,
  streamingText,
  activeTools,
  compact = false,
}: ThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [showReasoning, setShowReasoning] = useState(false);
  const [toolHistory, setToolHistory] = useState<string[]>([]);

  // Timer
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Track tool history (tools that have been used, not just active)
  useEffect(() => {
    if (activeTools.length > 0) {
      setToolHistory((prev) => {
        const next = [...prev];
        for (const t of activeTools) {
          if (!next.includes(t)) next.push(t);
        }
        return next;
      });
    }
  }, [activeTools]);

  // Determine phase
  const phase = streamingText
    ? 'generating'
    : activeTools.length > 0
      ? 'tools'
      : 'thinking';

  const phaseLabel =
    phase === 'generating'
      ? 'Generating response'
      : phase === 'tools'
        ? `Using ${activeTools[activeTools.length - 1]}`
        : 'Reasoning';

  const PhaseIcon = phase === 'tools' ? Wrench : phase === 'generating' ? Cpu : Brain;

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="thinking-compact flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-800/60 border border-violet-500/20">
          <div className="thinking-orb" />
          <span className="text-xs text-slate-300 font-medium">{phaseLabel}</span>
          {activeTools.length > 0 && (
            <span className="text-[10px] text-violet-400 font-mono bg-violet-500/10 px-1.5 py-0.5 rounded">
              {activeTools[activeTools.length - 1]}
            </span>
          )}
          <span className="text-[10px] text-slate-500 tabular-nums ml-auto">{elapsed}s</span>
        </div>
        {streamingText && (
          <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{streamingText}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="thinking-card relative rounded-xl overflow-hidden kv-msg-left">
      {/* Animated gradient border */}
      <div className="thinking-border absolute inset-0 rounded-xl" />

      {/* Inner content */}
      <div className="relative bg-slate-900/95 m-[1px] rounded-[11px] px-4 py-3 space-y-2.5">
        {/* Header row */}
        <div className="flex items-center gap-3">
          {/* Animated orb */}
          <div className="thinking-orb-lg" />

          {/* Phase label */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <PhaseIcon className={cn(
                'h-3.5 w-3.5 shrink-0',
                phase === 'thinking' && 'text-violet-400',
                phase === 'tools' && 'text-amber-400',
                phase === 'generating' && 'text-emerald-400',
              )} />
              <span className={cn(
                'text-sm font-medium',
                phase === 'thinking' && 'text-violet-300',
                phase === 'tools' && 'text-amber-300',
                phase === 'generating' && 'text-emerald-300',
              )}>
                {phaseLabel}
              </span>
            </div>

            {/* Phase steps (dots) */}
            <div className="flex items-center gap-1 mt-1.5">
              <div className={cn('h-1 rounded-full transition-all duration-500',
                phase === 'thinking' ? 'w-8 bg-violet-400' : 'w-4 bg-violet-400/40'
              )} />
              <div className={cn('h-1 rounded-full transition-all duration-500',
                phase === 'tools' ? 'w-8 bg-amber-400' : toolHistory.length > 0 ? 'w-4 bg-amber-400/40' : 'w-4 bg-slate-700'
              )} />
              <div className={cn('h-1 rounded-full transition-all duration-500',
                phase === 'generating' ? 'w-8 bg-emerald-400' : 'w-4 bg-slate-700'
              )} />
            </div>
          </div>

          {/* Elapsed timer */}
          <span className="text-xs text-slate-500 tabular-nums font-mono">{elapsed}s</span>
        </div>

        {/* Tool pills — show tools that have been called */}
        {toolHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolHistory.map((tool) => {
              const isActive = activeTools.includes(tool);
              return (
                <span
                  key={tool}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md transition-all',
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 thinking-tool-active'
                      : 'bg-slate-800 text-slate-400 border border-slate-700/50',
                  )}
                >
                  <Wrench className="h-2.5 w-2.5" />
                  {tool}
                  {isActive && <span className="thinking-tool-dot" />}
                </span>
              );
            })}
          </div>
        )}

        {/* Collapsible reasoning text */}
        {thinkingText && (
          <div>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
            >
              {showReasoning ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Agent reasoning
            </button>
            {showReasoning && (
              <pre className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto scrollbar-thin">
                {thinkingText}
              </pre>
            )}
          </div>
        )}

        {/* Streaming text preview */}
        {streamingText && (
          <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
            {streamingText}
          </pre>
        )}
      </div>
    </div>
  );
}
