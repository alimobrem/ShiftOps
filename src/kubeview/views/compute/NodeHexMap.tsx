/**
 * NodeHexMap — Command-center hexagonal node visualization.
 * Each node is a glowing hexagon with pod grid, resource gauges,
 * and status-driven coloring.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Server, Cpu, MemoryStick, Box, ChevronRight } from 'lucide-react';
import type { NodeDetail } from './types';

export interface PodInfo {
  name: string;
  namespace: string;
  status: string; // Running, Pending, Failed, Succeeded, Unknown
  restarts: number;
}

interface Props {
  nodes: NodeDetail[];
  /** Map of node name → pods running on that node */
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

/** CSS clip-path for a proper flat-top hexagon (60° angles) */
const HEX_CLIP = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)';

function GaugeBar({ icon: Icon, value, color }: { icon: any; value: number | null; color: string }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : null;
  return (
    <div className="flex items-center gap-1">
      <Icon className="w-2.5 h-2.5 shrink-0" style={{ color }} />
      <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
        {pct != null ? (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color }}
          />
        ) : (
          <div className="h-full w-full bg-slate-700/30" />
        )}
      </div>
      <span className="text-[9px] font-mono w-6 text-right" style={{ color: pct != null && pct > 80 ? '#ef4444' : '#64748b' }}>
        {pct != null ? `${Math.round(pct)}%` : '—'}
      </span>
    </div>
  );
}

const POD_STATUS_COLOR: Record<string, string> = {
  Running: '#10b981',
  Succeeded: '#3b82f6',
  Pending: '#f59e0b',
  Failed: '#ef4444',
  Unknown: '#6b7280',
  CrashLoopBackOff: '#ef4444',
};

function HexNode({ nd, pods, onClick, onPodClick }: { nd: NodeDetail; pods?: PodInfo[]; onClick?: () => void; onPodClick?: (ns: string, name: string) => void }) {
  const status = getStatus(nd);
  const [hovered, setHovered] = useState(false);
  const [hoveredPod, setHoveredPod] = useState<PodInfo | null>(null);

  const podPct = nd.podCap > 0 ? Math.round((nd.podCount / nd.podCap) * 100) : 0;

  const shortName = nd.name
    .replace(/^ip-/, '')
    .replace(/\..*internal$/, '')
    .replace(/\..*compute$/, '')
    .slice(-14);

  return (
    <div
      className="relative cursor-pointer transition-all duration-200"
      style={{ width: 180, height: 200 }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hex outer glow */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          clipPath: HEX_CLIP,
          background: hovered ? status.color : `${status.color}60`,
          filter: hovered ? `blur(8px)` : 'blur(4px)',
          opacity: hovered ? 0.3 : 0.1,
          transform: hovered ? 'scale(1.04)' : 'scale(1)',
        }}
      />

      {/* Hex border */}
      <div
        className="absolute inset-[1px] transition-all duration-200"
        style={{
          clipPath: HEX_CLIP,
          background: `linear-gradient(135deg, ${status.color}30, ${status.color}10)`,
        }}
      />

      {/* Hex body */}
      <div
        className="absolute inset-[2px] flex flex-col items-center justify-center px-4 py-3"
        style={{
          clipPath: HEX_CLIP,
          background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
        }}
      >
        {/* Status dot */}
        <div
          className="absolute top-5 right-10 w-1.5 h-1.5 rounded-full"
          style={{ background: status.color, boxShadow: `0 0 4px ${status.glow}` }}
        />

        {/* Node icon + name */}
        <Server className="w-4 h-4 mb-1" style={{ color: status.color }} />
        <div className="text-[10px] font-semibold text-slate-200 text-center truncate w-full">{shortName}</div>
        <div className="text-[8px] text-slate-500 mb-2">{nd.roles.join(' · ')}</div>

        {/* Gauges */}
        <div className="w-full space-y-0.5 mb-2 px-1">
          <GaugeBar icon={Cpu} value={nd.cpuUsagePct} color="#3b82f6" />
          <GaugeBar icon={MemoryStick} value={nd.memUsagePct} color="#8b5cf6" />
        </div>

        {/* Pod dots — clickable if pod data available */}
        <div className="flex flex-wrap gap-[2px] justify-center max-w-[90px] relative">
          {pods ? (
            // Real pods — each dot is clickable
            <>
              {pods.slice(0, 30).map((pod, i) => (
                <div
                  key={pod.name}
                  className="rounded-sm cursor-pointer hover:scale-150 hover:z-10 transition-transform relative"
                  style={{
                    width: 6,
                    height: 6,
                    background: POD_STATUS_COLOR[pod.status] || '#6b7280',
                    opacity: 0.9,
                  }}
                  onClick={(e) => { e.stopPropagation(); onPodClick?.(pod.namespace, pod.name); }}
                  onMouseEnter={() => setHoveredPod(pod)}
                  onMouseLeave={() => setHoveredPod(null)}
                />
              ))}
              {/* Empty slots */}
              {Array.from({ length: Math.max(0, Math.min(nd.podCap - pods.length, 20)) }, (_, i) => (
                <div key={`empty-${i}`} className="rounded-sm" style={{ width: 6, height: 6, background: '#1e293b', opacity: 0.2 }} />
              ))}
            </>
          ) : (
            // Fallback: no pod data, show count-based dots
            Array.from({ length: Math.min(nd.podCap, 25) }, (_, i) => (
              <div
                key={i}
                className="rounded-sm"
                style={{
                  width: 6,
                  height: 6,
                  background: i < nd.podCount
                    ? podPct > 90 ? '#ef4444' : podPct > 75 ? '#f59e0b' : '#10b981'
                    : '#1e293b',
                  opacity: i < nd.podCount ? 0.9 : 0.2,
                }}
              />
            ))
          )}
        </div>
        <div className="text-[8px] font-mono text-slate-500 mt-0.5">{nd.podCount}/{nd.podCap}</div>
      </div>

      {/* Pod tooltip — outside clip-path so it's visible */}
      {hoveredPod && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 shadow-xl z-50 pointer-events-none min-w-[200px]">
          <div className="text-[11px] font-semibold text-slate-100">{hoveredPod.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{hoveredPod.namespace}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[10px]">
              <span className="w-2 h-2 rounded-full" style={{ background: POD_STATUS_COLOR[hoveredPod.status] || '#6b7280' }} />
              <span style={{ color: POD_STATUS_COLOR[hoveredPod.status] || '#94a3b8' }}>{hoveredPod.status}</span>
            </span>
            {hoveredPod.restarts > 0 && (
              <span className="text-[10px] text-amber-400">{hoveredPod.restarts} restart{hoveredPod.restarts !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="text-[9px] text-slate-500 mt-1">Click to inspect pod</div>
        </div>
      )}
    </div>
  );
}

export function NodeHexMap({ nodes, podsByNode, onNodeClick, onPodClick, onViewAll }: Props) {
  const sorted = [...nodes].sort((a, b) => {
    const aReady = a.status.ready ? 1 : 0;
    const bReady = b.status.ready ? 1 : 0;
    if (aReady !== bReady) return aReady - bReady;
    return a.name.localeCompare(b.name);
  });

  const visible = sorted.slice(0, MAX_VISIBLE);
  const remaining = nodes.length - MAX_VISIBLE;
  const readyCount = nodes.filter(n => n.status.ready).length;
  const totalPods = nodes.reduce((sum, n) => sum + n.podCount, 0);
  const totalCap = nodes.reduce((sum, n) => sum + n.podCap, 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
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
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Honeycomb hex grid — offset odd rows for hex tiling */}
      <div className="flex flex-col items-center gap-0">
        {(() => {
          const cols = Math.min(visible.length, 4);
          const rows: NodeDetail[][] = [];
          for (let i = 0; i < visible.length; i += cols) {
            rows.push(visible.slice(i, i + cols));
          }
          return rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="flex gap-1 justify-center"
              style={{ marginTop: rowIdx > 0 ? -20 : 0, marginLeft: rowIdx % 2 === 1 ? 90 : 0 }}
            >
              {row.map(nd => (
                <HexNode
                  key={nd.name}
                  nd={nd}
                  pods={podsByNode?.[nd.name]}
                  onClick={() => onNodeClick?.(nd.name)}
                  onPodClick={onPodClick}
                />
              ))}
            </div>
          ));
        })()}
      </div>

      {/* View all link */}
      {remaining > 0 && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-colors"
          >
            View all {nodes.length} nodes <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
