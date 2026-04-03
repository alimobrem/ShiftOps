/**
 * NodeHexMap — Zoomable honeycomb cluster map.
 * 250 hex slots shown at overview zoom. Active nodes glow.
 * Mouse wheel to zoom, drag to pan, click to inspect.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Server, ZoomIn, ZoomOut, Maximize2, Search, X, ChevronRight } from 'lucide-react';
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

const TOTAL_SLOTS = 250;
const COLS = 25;
const HEX_R = 14;
const HEX_W = HEX_R * 2;
const HEX_H = Math.sqrt(3) * HEX_R;
// Proper hex tiling: horizontal = 1.5 * R, vertical = sqrt(3) * R
const GAP_X = HEX_R * 1.55;
const GAP_Y = HEX_H * 1.05;

const STATUS_COLOR: Record<string, string> = {
  ready: '#10b981',
  pressure: '#f59e0b',
  notReady: '#ef4444',
  cordoned: '#6b7280',
};

const POD_STATUS_COLOR: Record<string, string> = {
  Running: '#10b981', Succeeded: '#3b82f6', Pending: '#f59e0b',
  Failed: '#ef4444', Unknown: '#6b7280', CrashLoopBackOff: '#ef4444',
};

function getStatusKey(nd: NodeDetail): string {
  if (!nd.status.ready) return 'notReady';
  if (nd.unschedulable) return 'cordoned';
  if (nd.pressures.length > 0) return 'pressure';
  return 'ready';
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

// Hex grid position for slot index
function hexPos(i: number) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const cx = HEX_R + 6 + col * GAP_X + (row % 2 === 1 ? GAP_X / 2 : 0);
  const cy = HEX_R + 6 + row * GAP_Y;
  return { cx, cy };
}

export function NodeHexMap({ nodes, podsByNode, onNodeClick, onPodClick, onViewAll }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = nodes.filter(nd =>
    !filter || nd.name.toLowerCase().includes(filter.toLowerCase())
  ).sort((a, b) => {
    if (a.status.ready !== b.status.ready) return a.status.ready ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  const readyCount = nodes.filter(n => n.status.ready).length;
  const totalPods = nodes.reduce((s, n) => s + n.podCount, 0);
  const totalCap = nodes.reduce((s, n) => s + n.podCap, 0);

  // Map nodes to slot indices (first N slots)
  const nodeSlots = new Map<number, NodeDetail>();
  filtered.forEach((nd, i) => nodeSlots.set(i, nd));

  const svgW = COLS * GAP_X + HEX_R + 12;
  const totalRows = Math.ceil(TOTAL_SLOTS / COLS);
  const svgH = totalRows * GAP_Y + HEX_R + 12;

  // Zoom controls
  const zoomIn = () => setZoom(z => Math.min(z * 1.4, 6));
  const zoomOut = () => setZoom(z => Math.max(z / 1.4, 0.5));
  const resetView = () => { setZoom(2); setPan({ x: 0, y: 0 }); };

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom(z => Math.min(Math.max(z * factor, 0.5), 6));
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Hovered node info
  const hoveredNode = hoveredSlot !== null ? nodeSlots.get(hoveredSlot) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-800/30 flex items-center justify-center">
            <Server className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Cluster Map</h3>
            <p className="text-[10px] text-slate-500">{readyCount}/{nodes.length} nodes active · {totalPods} pods · {TOTAL_SLOTS} slots</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1 bg-slate-800/50 rounded px-2 py-1 border border-slate-700/50">
            <Search className="w-3 h-3 text-slate-500" />
            <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Find node..." className="bg-transparent text-[10px] text-slate-300 placeholder-slate-600 outline-none w-20" />
            {filter && <button onClick={() => setFilter('')}><X className="w-2.5 h-2.5 text-slate-500" /></button>}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 text-[9px] text-slate-500 mx-2">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Warn</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Down</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-700" /> Empty</span>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 bg-slate-800 rounded border border-slate-700/50">
            <button onClick={zoomOut} className="p-1 text-slate-400 hover:text-slate-200 transition-colors"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-[9px] text-slate-500 w-8 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} className="p-1 text-slate-400 hover:text-slate-200 transition-colors"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={resetView} className="p-1 text-slate-400 hover:text-slate-200 transition-colors border-l border-slate-700/50"><Maximize2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Map viewport */}
      <div
        ref={containerRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ height: 340 }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMinYMin meet"
          className="transition-transform duration-100"
          style={{
            width: svgW * zoom,
            height: svgH * zoom,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <defs>
            <linearGradient id="hexFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <filter id="nodeGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* All hex slots */}
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
            const { cx, cy } = hexPos(i);
            const nd = nodeSlots.get(i);
            const isHovered = hoveredSlot === i;

            if (!nd) {
              // Empty slot
              return (
                <polygon
                  key={i}
                  points={hexPoints(cx, cy, HEX_R - 1)}
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              );
            }

            // Active node
            const sk = getStatusKey(nd);
            const color = STATUS_COLOR[sk];
            const pods = podsByNode?.[nd.name] || [];
            const isOverloaded = (nd.cpuUsagePct ?? 0) > 80 || (nd.memUsagePct ?? 0) > 80;

            return (
              <g key={i}
                className="cursor-pointer"
                onClick={() => onNodeClick?.(nd.name)}
                onMouseEnter={() => setHoveredSlot(i)}
                onMouseLeave={() => setHoveredSlot(null)}
              >
                {/* Glow ring */}
                <polygon
                  points={hexPoints(cx, cy, HEX_R + 1)}
                  fill="none" stroke={color} strokeWidth={isHovered ? 1.5 : 0.5}
                  opacity={isHovered ? 0.6 : 0.2}
                  filter={isHovered ? 'url(#nodeGlow)' : undefined}
                />

                {/* Hex body */}
                <polygon
                  points={hexPoints(cx, cy, HEX_R - 1)}
                  fill="url(#hexFill)" stroke={color} strokeWidth={1}
                  opacity={0.95}
                />

                {/* Capacity fill — inner hex sized by pod usage */}
                <polygon
                  points={hexPoints(cx, cy, HEX_R * (nd.podCount / nd.podCap) * 0.7)}
                  fill={color} opacity={0.12}
                />

                {/* Status dot */}
                <circle cx={cx} cy={cy} r={2} fill={color} opacity={0.8} />

                {/* Overload pulse */}
                {isOverloaded && (
                  <polygon
                    points={hexPoints(cx, cy, HEX_R - 1)}
                    fill="#f59e0b" opacity={0.15}
                  >
                    <animate attributeName="opacity" values="0.05;0.2;0.05" dur="2s" repeatCount="indefinite" />
                  </polygon>
                )}

                {/* Name label — only when zoomed in enough */}
                {zoom >= 1.5 && (
                  <>
                    <text x={cx} y={cy - 3} textAnchor="middle" fill="#e2e8f0" fontSize={4} fontWeight={600}>
                      {nd.name.replace(/^ip-/, '').replace(/\..*/, '').slice(-10)}
                    </text>
                    <text x={cx} y={cy + 3} textAnchor="middle" fill="#64748b" fontSize={3}>
                      {nd.podCount}/{nd.podCap}
                    </text>
                  </>
                )}

                {/* Pod dots — only when zoomed in a lot */}
                {zoom >= 3 && pods.slice(0, 12).map((pod, j) => {
                  const angle = (j / 12) * Math.PI * 2;
                  const pr = HEX_R * 0.5;
                  const px = cx + pr * Math.cos(angle);
                  const py = cy + pr * Math.sin(angle);
                  return (
                    <circle key={pod.name} cx={px} cy={py} r={1.2}
                      fill={POD_STATUS_COLOR[pod.status] || '#6b7280'}
                      className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onPodClick?.(pod.namespace, pod.name); }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover info panel */}
        {hoveredNode && (
          <div className="absolute top-2 right-2 w-48 rounded-lg bg-slate-800/95 border border-slate-700 shadow-xl p-3 pointer-events-none z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[getStatusKey(hoveredNode)] }} />
              <span className="text-xs font-semibold text-slate-100 truncate">{hoveredNode.name.replace(/^ip-/, '').replace(/\..*internal$/, '')}</span>
            </div>
            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Role</span>
                <span className="text-slate-300">{hoveredNode.roles.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CPU</span>
                <span className={cn('font-mono', (hoveredNode.cpuUsagePct ?? 0) > 80 ? 'text-red-400' : 'text-slate-300')}>
                  {hoveredNode.cpuUsagePct != null ? `${Math.round(hoveredNode.cpuUsagePct)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Memory</span>
                <span className={cn('font-mono', (hoveredNode.memUsagePct ?? 0) > 80 ? 'text-red-400' : 'text-slate-300')}>
                  {hoveredNode.memUsagePct != null ? `${Math.round(hoveredNode.memUsagePct)}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pods</span>
                <span className="text-slate-300 font-mono">{hoveredNode.podCount}/{hoveredNode.podCap}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Age</span>
                <span className="text-slate-300">{hoveredNode.age}</span>
              </div>
            </div>
            <div className="mt-2 pt-1.5 border-t border-slate-700/50 text-[9px] text-slate-500">Click to inspect · Scroll to zoom</div>
          </div>
        )}

        {/* Zoom hint */}
        {zoom === 1 && !hoveredNode && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-600 pointer-events-none">
            Scroll to zoom · Drag to pan · Click node to inspect
          </div>
        )}
      </div>
    </div>
  );
}
