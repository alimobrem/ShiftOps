import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSection, Title, Card, CardBody } from '@patternfly/react-core';
import { useClusterStore } from '@/store/useClusterStore';
import type { Pod, Deployment, Service, Node } from '@/store/useClusterStore';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 220;
const ROW_GAP = 24;
const PADDING_X = 60;
const PADDING_Y = 80;

const STATUS_COLORS: Record<string, string> = {
  Running: '#22c55e',
  Ready: '#22c55e',
  Available: '#22c55e',
  Pending: '#f59e0b',
  Progressing: '#f59e0b',
  Failed: '#ef4444',
  NotReady: '#ef4444',
};

const COLUMN_LABELS = ['Services', 'Deployments', 'Pods', 'Nodes'] as const;

const COLUMN_COLORS: Record<string, string> = {
  Services: '#6366f1',
  Deployments: '#3b82f6',
  Pods: '#22d3ee',
  Nodes: '#a78bfa',
};

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG paths)                                          */
/* ------------------------------------------------------------------ */

function ServiceIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path
        d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1H2V4zm0 3h12v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zm5 2a1 1 0 1 0 2 0 1 1 0 0 0-2 0z"
        fill="currentColor"
        opacity={0.7}
      />
    </g>
  );
}

function DeploymentIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
      <circle cx="8" cy="8" r="3" fill="currentColor" opacity={0.7} />
    </g>
  );
}

function PodIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" opacity={0.7} />
      <rect x="5" y="5" width="6" height="6" rx="1" fill="var(--pf-v5-global--BackgroundColor--100, #fff)" />
    </g>
  );
}

function NodeIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="1" y="4" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
      <line x1="4" y1="13" x2="4" y2="15" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
      <line x1="12" y1="13" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
      <line x1="3" y1="15" x2="13" y2="15" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Types for the graph                                               */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string;
  label: string;
  column: number;
  row: number;
  status: string;
  kind: 'Service' | 'Deployment' | 'Pod' | 'Node';
  namespace?: string;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

/* ------------------------------------------------------------------ */
/*  Layout helper                                                     */
/* ------------------------------------------------------------------ */

function buildGraph(
  services: Service[],
  deployments: Deployment[],
  pods: Pod[],
  nodes: Node[],
): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const graphNodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];

  const columns: Array<{ kind: GraphNode['kind']; items: Array<{ id: string; label: string; status: string; namespace?: string }> }> = [
    {
      kind: 'Service',
      items: services.map((s) => ({ id: `svc-${s.namespace}-${s.name}`, label: s.name, status: 'Available', namespace: s.namespace })),
    },
    {
      kind: 'Deployment',
      items: deployments.map((d) => ({ id: `deploy-${d.namespace}-${d.name}`, label: d.name, status: d.status, namespace: d.namespace })),
    },
    {
      kind: 'Pod',
      items: pods.map((p) => ({ id: `pod-${p.namespace}-${p.name}`, label: p.name, status: p.status, namespace: p.namespace })),
    },
    {
      kind: 'Node',
      items: nodes.map((n) => ({ id: `node-${n.name}`, label: n.name, status: n.status })),
    },
  ];

  let maxRows = 0;
  columns.forEach((col) => {
    if (col.items.length > maxRows) maxRows = col.items.length;
  });

  columns.forEach((col, colIdx) => {
    const colX = PADDING_X + colIdx * (NODE_WIDTH + COLUMN_GAP);
    const totalHeight = col.items.length * NODE_HEIGHT + (col.items.length - 1) * ROW_GAP;
    const maxHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
    const offsetY = PADDING_Y + (maxHeight - totalHeight) / 2;

    col.items.forEach((item, rowIdx) => {
      graphNodes.push({
        id: item.id,
        label: item.label,
        column: colIdx,
        row: rowIdx,
        status: item.status,
        kind: col.kind,
        ...(item.namespace != null ? { namespace: item.namespace } : {}),
        x: colX,
        y: offsetY + rowIdx * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  // Edges: Service -> Pods (match by base name within same namespace)
  services.forEach((svc) => {
    pods.forEach((pod) => {
      if (pod.namespace === svc.namespace && pod.name.startsWith(svc.name)) {
        graphEdges.push({
          source: `svc-${svc.namespace}-${svc.name}`,
          target: `pod-${pod.namespace}-${pod.name}`,
        });
      }
    });
  });

  // Edges: Deployment -> Pods (match by base name within same namespace)
  deployments.forEach((dep) => {
    pods.forEach((pod) => {
      if (pod.namespace === dep.namespace && pod.name.startsWith(dep.name)) {
        graphEdges.push({
          source: `deploy-${dep.namespace}-${dep.name}`,
          target: `pod-${pod.namespace}-${pod.name}`,
        });
      }
    });
  });

  // Edges: Pod -> Node (round-robin assignment for demo data)
  if (nodes.length > 0) {
    pods.forEach((pod, i) => {
      const node = nodes[i % nodes.length]!;
      graphEdges.push({
        source: `pod-${pod.namespace}-${pod.name}`,
        target: `node-${node.name}`,
      });
    });
  }

  const width = PADDING_X * 2 + columns.length * NODE_WIDTH + (columns.length - 1) * COLUMN_GAP;
  const height = PADDING_Y * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;

  return { nodes: graphNodes, edges: graphEdges, width, height };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function GraphNodeRect({
  node,
  onClick,
}: {
  node: GraphNode;
  onClick: (node: GraphNode) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = STATUS_COLORS[node.status] ?? '#94a3b8';
  const colLabel = COLUMN_LABELS[node.column] ?? 'Pods';
  const borderColor = COLUMN_COLORS[colLabel] ?? '#64748b';

  const truncatedLabel = node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label;

  const IconComponent = {
    Service: ServiceIcon,
    Deployment: DeploymentIcon,
    Pod: PodIcon,
    Node: NodeIcon,
  }[node.kind];

  return (
    <g
      className="topology-node os-topology__node"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(node)}
    >
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={10}
        ry={10}
        fill={hovered ? 'var(--pf-v5-global--BackgroundColor--200, #f0f0f0)' : 'var(--pf-v5-global--BackgroundColor--100, #fff)'}
        stroke={borderColor}
        strokeWidth={hovered ? 2 : 1.5}
        filter={hovered ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.08))'}
      />
      {/* Status indicator dot */}
      <circle cx={node.x + 14} cy={node.y + NODE_HEIGHT / 2} r={5} fill={color} />
      {/* Icon */}
      <IconComponent x={node.x + 24} y={node.y + (NODE_HEIGHT - 16) / 2} />
      {/* Label */}
      <text
        x={node.x + 46}
        y={node.y + NODE_HEIGHT / 2 + 1}
        dominantBaseline="middle"
        fill="var(--pf-v5-global--Color--100, #151515)"
        fontSize={12}
        fontFamily="var(--pf-v5-global--FontFamily--sans-serif, RedHatText, sans-serif)"
        fontWeight={500}
      >
        <title>{node.label}</title>
        {truncatedLabel}
      </text>
    </g>
  );
}

function GraphEdgePath({
  sourceNode,
  targetNode,
}: {
  sourceNode: GraphNode;
  targetNode: GraphNode;
}) {
  const x1 = sourceNode.x + NODE_WIDTH;
  const y1 = sourceNode.y + NODE_HEIGHT / 2;
  const x2 = targetNode.x;
  const y2 = targetNode.y + NODE_HEIGHT / 2;
  const cpOffset = Math.abs(x2 - x1) * 0.45;

  const d = `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;

  return (
    <path
      d={d}
      fill="none"
      stroke="var(--pf-v5-global--BorderColor--100, #d2d2d2)"
      strokeWidth={1.2}
      strokeDasharray="6 3"
      opacity={0.6}
    />
  );
}

function Legend() {
  const kinds = [
    { label: 'Service', color: COLUMN_COLORS['Services'] },
    { label: 'Deployment', color: COLUMN_COLORS['Deployments'] },
    { label: 'Pod', color: COLUMN_COLORS['Pods'] },
    { label: 'Node', color: COLUMN_COLORS['Nodes'] },
  ];

  const statuses = [
    { label: 'Running / Ready / Available', color: '#22c55e' },
    { label: 'Pending / Progressing', color: '#f59e0b' },
    { label: 'Failed / NotReady', color: '#ef4444' },
  ];

  return (
    <g className="topology-legend">
      {/* Node types */}
      <text x={16} y={20} fontSize={11} fontWeight={700} fill="var(--pf-v5-global--Color--200, #6a6e73)">
        Resource Types
      </text>
      {kinds.map((k, i) => (
        <g key={k.label} transform={`translate(16, ${34 + i * 20})`}>
          <rect width={12} height={12} rx={3} fill="none" stroke={k.color} strokeWidth={1.5} />
          <text x={18} y={10} fontSize={11} fill="var(--pf-v5-global--Color--100, #151515)">
            {k.label}
          </text>
        </g>
      ))}

      {/* Status colors */}
      <text x={140} y={20} fontSize={11} fontWeight={700} fill="var(--pf-v5-global--Color--200, #6a6e73)">
        Status
      </text>
      {statuses.map((s, i) => (
        <g key={s.label} transform={`translate(140, ${34 + i * 20})`}>
          <circle cx={6} cy={6} r={5} fill={s.color} />
          <text x={18} y={10} fontSize={11} fill="var(--pf-v5-global--Color--100, #151515)">
            {s.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

const TopologyView: React.FC = () => {
  const navigate = useNavigate();
  const allPods = useClusterStore((s) => s.pods);
  const allDeployments = useClusterStore((s) => s.deployments);
  const allServices = useClusterStore((s) => s.services);
  const nodes = useClusterStore((s) => s.nodes);
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);

  const pods = selectedNamespace === 'all' ? allPods : allPods.filter((p) => p.namespace === selectedNamespace);
  const deployments = selectedNamespace === 'all' ? allDeployments : allDeployments.filter((d) => d.namespace === selectedNamespace);
  const services = selectedNamespace === 'all' ? allServices : allServices.filter((s) => s.namespace === selectedNamespace);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(
    () => buildGraph(services, deployments, pods, nodes),
    [services, deployments, pods, nodes],
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    graph.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [graph.nodes]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      switch (node.kind) {
        case 'Pod':
          navigate(`/workloads/pods/${node.namespace}/${node.label}`);
          break;
        case 'Deployment':
          navigate(`/workloads/deployments/${node.namespace}/${node.label}`);
          break;
        case 'Service':
          navigate(`/networking/services`);
          break;
        case 'Node':
          navigate(`/compute/nodes/${node.label}`);
          break;
      }
    },
    [navigate],
  );

  const LEGEND_HEIGHT = 110;
  const svgWidth = Math.max(graph.width, containerWidth);
  const svgHeight = graph.height + LEGEND_HEIGHT;
  const viewBox = `0 0 ${svgWidth} ${svgHeight}`;

  return (
    <PageSection>
      <Title headingLevel="h1" size="lg" className="os-topology__title">
        Resource Topology
      </Title>
      <Card>
        <CardBody>
          <div ref={containerRef} className="os-topology__container">
            <svg
              width="100%"
              height={svgHeight}
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
              style={{ '--os-topology-min-width': `${graph.width}px`, minWidth: 'var(--os-topology-min-width)' } as React.CSSProperties}
            >
              {/* Column headers */}
              {COLUMN_LABELS.map((label, idx) => {
                const colX = PADDING_X + idx * (NODE_WIDTH + COLUMN_GAP) + NODE_WIDTH / 2;
                return (
                  <text
                    key={label}
                    x={colX}
                    y={PADDING_Y - 24}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight={700}
                    fill={COLUMN_COLORS[label]}
                    fontFamily="var(--pf-v5-global--FontFamily--sans-serif, RedHatText, sans-serif)"
                  >
                    {label}
                  </text>
                );
              })}

              {/* Edges (render behind nodes) */}
              {graph.edges.map((edge) => {
                const src = nodeMap.get(edge.source);
                const tgt = nodeMap.get(edge.target);
                if (!src || !tgt) return null;
                return <GraphEdgePath key={`${edge.source}->${edge.target}`} sourceNode={src} targetNode={tgt} />;
              })}

              {/* Nodes */}
              {graph.nodes.map((node) => (
                <GraphNodeRect key={node.id} node={node} onClick={handleNodeClick} />
              ))}

              {/* Legend */}
              <g transform={`translate(${PADDING_X}, ${graph.height + 10})`}>
                <Legend />
              </g>
            </svg>
          </div>
        </CardBody>
      </Card>
    </PageSection>
  );
};

export default TopologyView;
