/**
 * NodeHexMap — Honeycomb grid visualization with active node hexes.
 * Background shows a hex mesh pattern. Active nodes fill hexes with
 * data (gauges, pods, status). Empty hexes remain as dim outlines.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Server, Cpu, MemoryStick, ChevronRight, Search,
  ShieldOff, Shield, Terminal, Trash2, FileText, Copy, X,
} from 'lucide-react';
import type { NodeDetail } from './types';

export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  restarts: number;
}

interface Props {
  nodes: NodeDetail[];
  podsByNode?: Record<string, PodInfo[]>;
  onNodeClick?: (name: string) => void;
  onPodClick?: (namespace: string, name: string) => void;
  onViewAll?: () => void;
}

const MAX_VISIBLE = 8;

const STATUS = {
  ready: { color: '#10b981', glow: '#10b98140', label: 'Ready' },
  pressure: { color: '#f59e0b', glow: '#f59e0b40', label: 'Pressure' },
  notReady: { color: '#ef4444', glow: '#ef444440', label: 'Not Ready' },
  cordoned: { color: '#6b7280', glow: '#6b728040', label: 'Cordoned' },
};

function getStatus(nd: NodeDetail) {
  if (!nd.status.ready) return STATUS.notReady;
  if (nd.unschedulable) return STATUS.cordoned;
  if (nd.pressures.length > 0) return STATUS.pressure;
  return STATUS.ready;
}

const POD_STATUS_COLOR: Record<string, string> = {
  Running: '#10b981', Succeeded: '#3b82f6', Pending: '#f59e0b',
  Failed: '#ef4444', Unknown: '#6b7280', CrashLoopBackOff: '#ef4444',
};

// ─── SVG Hex helpers ─────────────────────────────────────────────────────────

const HEX_SIZE = 85;
const HEX_W = HEX_SIZE * 2;
const HEX_H = Math.sqrt(3) * HEX_SIZE;

function hexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

// ─── Context Menu ────────────────────────────────────────────────────────────

interface ContextMenuItem { label: string; icon: any; action: () => void; danger?: boolean; }

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl py-1" style={{ left: x, top: y }}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { item.action(); onClose(); }}
          className={cn('flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors text-left',
            item.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-slate-300 hover:bg-slate-800')}>
          <item.icon className="w-3.5 h-3.5" />{item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function NodeHexMap({ nodes, podsByNode, onNodeClick, onPodClick, onViewAll }: Props) {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [hoveredPod, setHoveredPod] = useState<{ pod: PodInfo; x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const filtered = nodes
    .filter(nd => {
      if (filter && !nd.name.toLowerCase().includes(filter.toLowerCase())) return false;
      if (statusFilter === 'ready' && !nd.status.ready) return false;
      if (statusFilter === 'issues' && nd.status.ready && nd.pressures.length === 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.status.ready !== b.status.ready) return a.status.ready ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

  const visible = filtered.slice(0, MAX_VISIBLE);
  const remaining = filtered.length - MAX_VISIBLE;
  const readyCount = nodes.filter(n => n.status.ready).length;
  const totalPods = nodes.reduce((sum, n) => sum + n.podCount, 0);
  const totalCap = nodes.reduce((sum, n) => sum + n.podCap, 0);

  // Honeycomb grid positions — 4 columns, offset rows
  const COLS = 4;
  const TOTAL_HEXES = 8; // Always show 8 hex slots
  const hexPositions = Array.from({ length: TOTAL_HEXES }, (_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = HEX_SIZE + 10 + col * (HEX_W * 0.77) + (row % 2 === 1 ? HEX_W * 0.385 : 0);
    const cy = HEX_SIZE + 10 + row * (HEX_H * 0.88);
    return { cx, cy };
  });

  const svgW = COLS * (HEX_W * 0.77) + HEX_SIZE + 20;
  const svgH = Math.ceil(TOTAL_HEXES / COLS) * (HEX_H * 0.88) + HEX_SIZE + 20;

  const handleNodeContext = useCallback((e: React.MouseEvent, nd: NodeDetail) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'View Node Details', icon: FileText, action: () => onNodeClick?.(nd.name) },
        { label: 'Copy Node Name', icon: Copy, action: () => navigator.clipboard.writeText(nd.name) },
        { label: nd.unschedulable ? 'Uncordon Node' : 'Cordon Node', icon: nd.unschedulable ? Shield : ShieldOff, action: () => {} },
        { label: 'Open Terminal', icon: Terminal, action: () => {} },
        { label: 'Drain Node', icon: Trash2, action: () => {}, danger: true },
      ],
    });
  }, [onNodeClick]);

  const handlePodContext = useCallback((e: React.MouseEvent, pod: PodInfo) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'View Pod Details', icon: FileText, action: () => onPodClick?.(pod.namespace, pod.name) },
        { label: 'View Logs', icon: FileText, action: () => {} },
        { label: 'Copy Pod Name', icon: Copy, action: () => navigator.clipboard.writeText(pod.name) },
        { label: 'Exec Into Container', icon: Terminal, action: () => {} },
        { label: 'Delete Pod', icon: Trash2, action: () => {}, danger: true },
      ],
    });
  }, [onPodClick]);

  return (
    <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950 p-5">
      {/* Pulse animation */}
      <style>{`@keyframes hexPulse { 0%,100%{opacity:0.12} 50%{opacity:0.3} }`}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-800/30 flex items-center justify-center">
            <Server className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Cluster Nodes</h3>
            <p className="text-xs text-slate-500">{readyCount}/{nodes.length} ready · {totalPods}/{totalCap} pods</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {Object.entries(STATUS).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 flex-1 bg-slate-800/50 rounded-lg px-2.5 py-1.5 border border-slate-700/50">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter nodes..." className="bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none flex-1" />
          {filter && <button onClick={() => setFilter('')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>}
        </div>
        {['all', 'ready', 'issues'].map((f) => (
          <button key={f} onClick={() => setStatusFilter(f === 'all' ? null : f)}
            className={cn('px-2.5 py-1.5 rounded-lg text-xs transition-colors border',
              (statusFilter === f || (f === 'all' && !statusFilter))
                ? 'bg-blue-600/20 text-blue-300 border-blue-700/50'
                : 'text-slate-500 hover:text-slate-300 border-slate-700/30')}>
            {f === 'all' ? 'All' : f === 'ready' ? 'Healthy' : 'Issues'}
          </button>
        ))}
      </div>

      {/* Honeycomb SVG */}
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="overflow-visible">
        {/* Background hex mesh — always show all 8 slots */}
        {hexPositions.map((pos, i) => (
          <polygon
            key={`bg-${i}`}
            points={hexPoints(pos.cx, pos.cy, HEX_SIZE - 2)}
            fill="none"
            stroke="#1e293b"
            strokeWidth={1}
            strokeDasharray={i >= visible.length ? '4,4' : 'none'}
            opacity={i >= visible.length ? 0.4 : 0.6}
          />
        ))}

        {/* Active node hexes */}
        {visible.map((nd, i) => {
          const { cx, cy } = hexPositions[i];
          const status = getStatus(nd);
          const pods = podsByNode?.[nd.name] || [];
          const isOverloaded = (nd.cpuUsagePct ?? 0) > 80 || (nd.memUsagePct ?? 0) > 80;
          const shortName = nd.name.replace(/^ip-/, '').replace(/\..*internal$/, '').replace(/\..*compute$/, '').slice(-12);

          // Pod dot positions inside hex
          const podDots = pods.slice(0, 30);
          const maxDots = Math.min(nd.podCap, 30);
          const dotCols = Math.ceil(Math.sqrt(maxDots * 1.2));
          const dotSpacing = 8;
          const dotsStartX = cx - (dotCols * dotSpacing) / 2 + dotSpacing / 2;
          const dotsStartY = cy + 12;

          // Gauge bar dimensions
          const barW = HEX_SIZE * 1;
          const barX = cx - barW / 2;
          const cpuPct = nd.cpuUsagePct ?? 0;
          const memPct = nd.memUsagePct ?? 0;

          return (
            <g key={nd.name} className="cursor-pointer" onClick={() => onNodeClick?.(nd.name)}
              onContextMenu={(e) => { e.preventDefault(); handleNodeContext(e as any, nd); }}>

              {/* Pulse overlay for overloaded */}
              {isOverloaded && (
                <polygon points={hexPoints(cx, cy, HEX_SIZE - 3)} fill="#f59e0b"
                  style={{ animation: 'hexPulse 2s ease-in-out infinite' }} />
              )}

              {/* Hex fill */}
              <polygon points={hexPoints(cx, cy, HEX_SIZE - 3)}
                fill="url(#hexGrad)" stroke={status.color} strokeWidth={2} opacity={0.95} />

              {/* Status glow */}
              <polygon points={hexPoints(cx, cy, HEX_SIZE)} fill="none"
                stroke={status.color} strokeWidth={1} opacity={0.2}
                filter="url(#glow)" />

              {/* Node icon */}
              <text x={cx} y={cy - HEX_SIZE * 0.52} textAnchor="middle" fill={status.color} fontSize={14}>⬡</text>

              {/* Name + role */}
              <text x={cx} y={cy - HEX_SIZE * 0.32} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight={600}>{shortName}</text>
              <text x={cx} y={cy - HEX_SIZE * 0.18} textAnchor="middle" fill="#64748b" fontSize={9}>{nd.roles.join(' · ')}</text>

              {/* CPU gauge */}
              <rect x={barX} y={cy - 8} width={barW} height={4} rx={2} fill="#1e293b" />
              <rect x={barX} y={cy - 8} width={barW * cpuPct / 100} height={4} rx={2}
                fill={cpuPct > 80 ? '#ef4444' : cpuPct > 60 ? '#f59e0b' : '#3b82f6'} />
              <text x={cx + barW / 2 + 6} y={cy - 5} fill="#64748b" fontSize={8} fontWeight={500}>{Math.round(cpuPct)}%</text>
              <text x={barX - 2} y={cy - 5} textAnchor="end" fill="#3b82f6" fontSize={7}>CPU</text>

              {/* Memory gauge */}
              <rect x={barX} y={cy + 1} width={barW} height={4} rx={2} fill="#1e293b" />
              <rect x={barX} y={cy + 1} width={barW * memPct / 100} height={4} rx={2}
                fill={memPct > 80 ? '#ef4444' : memPct > 60 ? '#f59e0b' : '#8b5cf6'} />
              <text x={cx + barW / 2 + 6} y={cy + 4} fill="#64748b" fontSize={8} fontWeight={500}>{Math.round(memPct)}%</text>
              <text x={barX - 2} y={cy + 4} textAnchor="end" fill="#8b5cf6" fontSize={7}>MEM</text>

              {/* Pod dots */}
              {Array.from({ length: maxDots }, (_, j) => {
                const col = j % dotCols;
                const row = Math.floor(j / dotCols);
                const dx = dotsStartX + col * dotSpacing;
                const dy = dotsStartY + row * dotSpacing;
                const pod = j < podDots.length ? podDots[j] : null;
                const dotColor = pod ? (POD_STATUS_COLOR[pod.status] || '#6b7280') : '#0f172a';

                return (
                  <rect key={j} x={dx - 2.5} y={dy - 2.5} width={5} height={5} rx={1}
                    fill={dotColor} opacity={pod ? 0.9 : 0.15}
                    className={pod ? 'cursor-pointer' : ''}
                    onClick={pod ? (e) => { e.stopPropagation(); onPodClick?.(pod.namespace, pod.name); } : undefined}
                    onContextMenu={pod ? (e) => { e.stopPropagation(); handlePodContext(e as any, pod); } : undefined}
                    onMouseEnter={pod ? (e) => {
                      const rect = svgRef.current?.getBoundingClientRect();
                      setHoveredPod({ pod, x: e.clientX, y: rect ? rect.top + dy - 20 : e.clientY - 20 });
                    } : undefined}
                    onMouseLeave={() => setHoveredPod(null)}
                  />
                );
              })}

              {/* Pod count */}
              <text x={cx} y={cy + HEX_SIZE * 0.58} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily="monospace">
                {nd.podCount}/{nd.podCap}
              </text>

              {/* Status dot */}
              <circle cx={cx + HEX_SIZE * 0.5} cy={cy - HEX_SIZE * 0.4} r={3}
                fill={status.color} opacity={0.9}>
                {!nd.status.ready && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite" />}
              </circle>
            </g>
          );
        })}

        {/* SVG defs */}
        <defs>
          <linearGradient id="hexGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>

      {/* Pod tooltip (HTML, positioned absolutely) */}
      {hoveredPod && (
        <div className="fixed px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 shadow-xl z-50 pointer-events-none min-w-[200px]"
          style={{ left: hoveredPod.x + 10, top: hoveredPod.y - 50 }}>
          <div className="text-[11px] font-semibold text-slate-100">{hoveredPod.pod.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{hoveredPod.pod.namespace}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[10px]">
              <span className="w-2 h-2 rounded-full" style={{ background: POD_STATUS_COLOR[hoveredPod.pod.status] || '#6b7280' }} />
              <span style={{ color: POD_STATUS_COLOR[hoveredPod.pod.status] || '#94a3b8' }}>{hoveredPod.pod.status}</span>
            </span>
            {hoveredPod.pod.restarts > 0 && <span className="text-[10px] text-amber-400">{hoveredPod.pod.restarts} restarts</span>}
          </div>
          <div className="text-[9px] text-slate-500 mt-1">Click to inspect · Right-click for actions</div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}

      {/* View all */}
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <button onClick={onViewAll}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors">
            View all {filtered.length} nodes <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
