/**
 * NodeHexMap — Hexagonal node visualization.
 * Each hexagon represents a node. Inside each hex, dots represent pods
 * colored by status. The hex border color indicates node health.
 */

import { cn } from '@/lib/utils';
import type { NodeDetail } from './types';

interface Props {
  nodes: NodeDetail[];
  onNodeClick?: (name: string) => void;
}

const STATUS_COLORS = {
  ready: '#10b981',
  notReady: '#ef4444',
  pressure: '#f59e0b',
  unschedulable: '#6b7280',
};

const POD_COLORS = {
  Running: '#10b981',
  Pending: '#f59e0b',
  Failed: '#ef4444',
  Succeeded: '#3b82f6',
  Unknown: '#6b7280',
};

function getNodeColor(nd: NodeDetail): string {
  if (!nd.status.ready) return STATUS_COLORS.notReady;
  if (nd.pressures.length > 0) return STATUS_COLORS.pressure;
  if (nd.unschedulable) return STATUS_COLORS.unschedulable;
  return STATUS_COLORS.ready;
}

/** Generate hexagon SVG path for a given center and size */
function hexPath(cx: number, cy: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

/** Arrange pod dots in a grid inside the hex */
function podDots(cx: number, cy: number, podCount: number, podCap: number, hexSize: number) {
  const dots: Array<{ x: number; y: number; color: string }> = [];
  const innerSize = hexSize * 0.55;
  const cols = Math.ceil(Math.sqrt(podCap));
  const rows = Math.ceil(podCap / cols);
  const dotR = Math.min(innerSize / cols, innerSize / rows) * 0.35;
  const spacing = Math.min(innerSize * 2 / cols, innerSize * 2 / rows);

  for (let i = 0; i < podCap; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = cx - innerSize + spacing * (col + 0.5);
    const y = cy - innerSize + spacing * (row + 0.5) + 6; // offset below label
    const color = i < podCount ? POD_COLORS.Running : '#1e293b';
    dots.push({ x, y, color });
  }
  return { dots, dotR };
}

export function NodeHexMap({ nodes, onNodeClick }: Props) {
  const hexSize = 70;
  const gapX = hexSize * 1.85;
  const gapY = hexSize * 1.65;
  const cols = Math.min(nodes.length, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const rows = Math.ceil(nodes.length / cols);
  const svgW = cols * gapX + hexSize;
  const svgH = rows * gapY + hexSize;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2l6.5 3.75v7.5L10 17l-6.5-3.75v-7.5z" fillOpacity={0.3} stroke="currentColor" strokeWidth={1} />
        </svg>
        Node Map
        <span className="text-xs text-slate-500 font-normal">{nodes.length} nodes</span>
      </h3>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Pressure</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> NotReady</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#1e293b', border: '1px solid #475569' }} /> Empty slot</span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="overflow-visible"
      >
        {nodes.map((nd, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = hexSize + col * gapX + (row % 2 === 1 ? gapX / 2 : 0);
          const cy = hexSize + row * gapY;
          const color = getNodeColor(nd);
          const { dots, dotR } = podDots(cx, cy, nd.podCount, nd.podCap, hexSize);

          const cpuPct = nd.cpuUsagePct != null ? Math.round(nd.cpuUsagePct) : null;
          const memPct = nd.memUsagePct != null ? Math.round(nd.memUsagePct) : null;

          return (
            <g
              key={nd.name}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onClick={() => onNodeClick?.(nd.name)}
            >
              <title>{`${nd.name}\n${nd.roles.join(', ')}\nStatus: ${nd.status.ready ? 'Ready' : 'NotReady'}${nd.pressures.length ? ' (' + nd.pressures.join(', ') + ')' : ''}\nPods: ${nd.podCount}/${nd.podCap}\nCPU: ${cpuPct != null ? cpuPct + '%' : 'N/A'}\nMemory: ${memPct != null ? memPct + '%' : 'N/A'}\nInstance: ${nd.instanceType || 'unknown'}\nAge: ${nd.age}\n\nClick to view node details and pods`}</title>
              {/* Hex background */}
              <path
                d={hexPath(cx, cy, hexSize)}
                fill="#0f172a"
                stroke={color}
                strokeWidth={2.5}
                opacity={0.9}
              />

              {/* CPU/Memory usage fill (inner hex, sized by usage) */}
              {cpuPct != null && (
                <path
                  d={hexPath(cx, cy, hexSize * 0.95)}
                  fill={color}
                  opacity={0.08 + (cpuPct / 100) * 0.15}
                />
              )}

              {/* Node name */}
              <text
                x={cx}
                y={cy - hexSize * 0.55}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={9}
                fontWeight={600}
              >
                {nd.name.replace(/^ip-/, '').replace(/\..*/, '').slice(-12)}
              </text>

              {/* Role badge */}
              <text
                x={cx}
                y={cy - hexSize * 0.38}
                textAnchor="middle"
                fill={nd.roles.includes('master') || nd.roles.includes('control-plane') ? '#a78bfa' : '#64748b'}
                fontSize={7}
              >
                {nd.roles.join(',')}
              </text>

              {/* Pod dots */}
              {dots.map((dot, j) => (
                <circle
                  key={j}
                  cx={dot.x}
                  cy={dot.y}
                  r={dotR}
                  fill={dot.color}
                  opacity={dot.color === '#1e293b' ? 0.3 : 0.85}
                />
              ))}

              {/* Pod count label */}
              <text
                x={cx}
                y={cy + hexSize * 0.55}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize={8}
                fontWeight={500}
              >
                {nd.podCount}/{nd.podCap} pods
              </text>

              {/* CPU/Mem bar at bottom */}
              {cpuPct != null && memPct != null && (
                <>
                  <rect x={cx - 20} y={cy + hexSize * 0.62} width={16} height={3} rx={1} fill="#1e293b" />
                  <rect x={cx - 20} y={cy + hexSize * 0.62} width={16 * cpuPct / 100} height={3} rx={1} fill="#3b82f6" />
                  <text x={cx - 1} y={cy + hexSize * 0.66} fill="#64748b" fontSize={5}>CPU</text>

                  <rect x={cx + 4} y={cy + hexSize * 0.62} width={16} height={3} rx={1} fill="#1e293b" />
                  <rect x={cx + 4} y={cy + hexSize * 0.62} width={16 * memPct / 100} height={3} rx={1} fill="#8b5cf6" />
                  <text x={cx + 23} y={cy + hexSize * 0.66} fill="#64748b" fontSize={5}>Mem</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
