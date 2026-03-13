import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Label } from '@patternfly/react-core';
import { buildDependencyGraph, getNodeHref, type DependencyGraph, type GraphNode } from '@/lib/dependencyGraph';

interface DependencyGraphViewProps {
  kind: string;
  name: string;
  namespace: string;
}

const kindColors: Record<string, string> = {
  Deployment: 'var(--theme-color-1, #0066cc)',
  ReplicaSet: '#4394e5',
  StatefulSet: '#0066cc',
  DaemonSet: '#004b95',
  Pod: '#3e8635',
  Service: '#009596',
  Ingress: '#8476d1',
  Route: '#8476d1',
  ConfigMap: '#f0ab00',
  Secret: '#c9190b',
  HPA: '#ec7a08',
  PDB: '#6753ac',
  NetworkPolicy: '#a30000',
  Job: '#06c',
};

function getColor(kind: string): string {
  return kindColors[kind] ?? '#6a6e73';
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  layer: number;
}

function layoutGraph(graph: DependencyGraph): LayoutNode[] {
  if (graph.nodes.length === 0) return [];

  // Assign layers by BFS from root
  const layers = new Map<string, number>();
  const queue = [graph.rootId];
  layers.set(graph.rootId, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current)!;
    for (const edge of graph.edges) {
      const neighbor = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (neighbor && !layers.has(neighbor)) {
        // Parents (edges pointing TO current) go left, children go right
        const isParent = edge.to === current;
        layers.set(neighbor, isParent ? currentLayer - 1 : currentLayer + 1);
        queue.push(neighbor);
      }
    }
  }

  // Normalize layers to start from 0
  const minLayer = Math.min(...Array.from(layers.values()));
  for (const [id, layer] of layers) {
    layers.set(id, layer - minLayer);
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    const group = layerGroups.get(layer) ?? [];
    group.push(id);
    layerGroups.set(layer, group);
  }

  const colWidth = 200;
  const rowHeight = 70;
  const paddingX = 80;
  const paddingY = 60;

  return graph.nodes.map((node) => {
    const layer = layers.get(node.id) ?? 0;
    const group = layerGroups.get(layer) ?? [node.id];
    const indexInGroup = group.indexOf(node.id);
    return {
      ...node,
      x: paddingX + layer * colWidth,
      y: paddingY + indexInGroup * rowHeight,
      layer,
    };
  });
}

export default function DependencyGraphView({ kind, name, namespace }: DependencyGraphViewProps) {
  const navigate = useNavigate();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [blastRadiusNode, setBlastRadiusNode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildDependencyGraph(kind, name, namespace).then((g) => {
      if (!cancelled) {
        setGraph(g);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [kind, name, namespace]);

  const layoutNodes = useMemo(() => {
    if (!graph) return [];
    return layoutGraph(graph);
  }, [graph]);

  const connectedToHovered = useMemo(() => {
    if (!hoveredNode || !graph) return new Set<string>();
    const ids = new Set<string>([hoveredNode]);
    for (const e of graph.edges) {
      if (e.from === hoveredNode) ids.add(e.to);
      if (e.to === hoveredNode) ids.add(e.from);
    }
    return ids;
  }, [hoveredNode, graph]);

  // Blast radius: everything downstream (children) of a node
  const blastRadius = useMemo(() => {
    if (!blastRadiusNode || !graph) return new Set<string>();
    const affected = new Set<string>([blastRadiusNode]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of graph.edges) {
        if (affected.has(e.from) && !affected.has(e.to)) {
          affected.add(e.to);
          changed = true;
        }
      }
    }
    return affected;
  }, [blastRadiusNode, graph]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    const href = getNodeHref(node);
    if (href) navigate(href);
  }, [navigate]);

  const handleNodeRightClick = useCallback((e: React.MouseEvent, node: GraphNode) => {
    e.preventDefault();
    setBlastRadiusNode((prev) => prev === node.id ? null : node.id);
  }, []);

  if (loading) {
    return <div className="os-text-muted" style={{ padding: 16 }}>Building dependency graph...</div>;
  }

  if (!graph || graph.nodes.length <= 1) {
    return <div className="os-text-muted" style={{ padding: 16 }}>No dependencies found for this resource.</div>;
  }

  const maxLayer = Math.max(...layoutNodes.map((n) => n.layer));
  const maxInLayer = Math.max(...Array.from(
    layoutNodes.reduce((m, n) => {
      m.set(n.layer, (m.get(n.layer) ?? 0) + 1);
      return m;
    }, new Map<number, number>()).values()
  ));

  const svgWidth = Math.max(700, (maxLayer + 1) * 200 + 160);
  const svgHeight = Math.max(300, maxInLayer * 70 + 120);

  const uniqueKinds = [...new Set(graph.nodes.map((n) => n.kind))];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {uniqueKinds.map((k) => (
          <Label key={k} style={{ background: getColor(k), color: '#fff', fontSize: 10 }}>{k}</Label>
        ))}
        <span style={{ fontSize: 11, color: 'var(--os-text-muted, #8a8d90)', marginLeft: 8 }}>
          Right-click a node to highlight blast radius
        </span>
      </div>

      <Card>
        <CardBody style={{ padding: 0, overflow: 'auto' }}>
          <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minHeight: 300 }}>
            {/* Edges */}
            {graph.edges.map((e, i) => {
              const from = layoutNodes.find((n) => n.id === e.from);
              const to = layoutNodes.find((n) => n.id === e.to);
              if (!from || !to) return null;

              const isBlast = blastRadiusNode && blastRadius.has(e.from) && blastRadius.has(e.to);
              const dimmed = hoveredNode && !connectedToHovered.has(e.from) && !connectedToHovered.has(e.to);

              return (
                <g key={i}>
                  <line
                    x1={from.x + 70} y1={from.y + 16}
                    x2={to.x - 10} y2={to.y + 16}
                    stroke={isBlast ? '#c9190b' : dimmed ? 'var(--modern-border, #e0e0e0)' : 'var(--os-text-muted, #999)'}
                    strokeWidth={isBlast ? 2 : 1}
                    strokeDasharray={isBlast ? '' : '4,4'}
                    markerEnd="url(#arrowhead)"
                  />
                  {!dimmed && (
                    <text
                      x={(from.x + 70 + to.x - 10) / 2}
                      y={(from.y + to.y) / 2 + 10}
                      textAnchor="middle" fontSize={9}
                      fill="var(--os-text-muted, #999)"
                    >
                      {e.relationship}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Arrow marker */}
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--os-text-muted, #999)" />
              </marker>
            </defs>

            {/* Nodes */}
            {layoutNodes.map((node) => {
              const isRoot = node.id === graph.rootId;
              const dimmed = hoveredNode && hoveredNode !== node.id && !connectedToHovered.has(node.id);
              const isBlast = blastRadiusNode && blastRadius.has(node.id);
              const color = getColor(node.kind);

              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer', opacity: dimmed ? 0.3 : 1 }}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleNodeClick(node)}
                  onContextMenu={(e) => handleNodeRightClick(e, node)}
                >
                  <rect
                    x={node.x - 10} y={node.y}
                    width={150} height={36}
                    rx={6}
                    fill={isBlast ? 'rgba(201,25,11,0.12)' : `${color}18`}
                    stroke={isRoot ? color : isBlast ? '#c9190b' : `${color}80`}
                    strokeWidth={isRoot ? 2 : 1}
                  />
                  <circle cx={node.x + 4} cy={node.y + 18} r={5} fill={color} />
                  <text x={node.x + 14} y={node.y + 15} fontSize={11} fontWeight={isRoot ? 700 : 500} fill="var(--os-text-primary, #151515)">
                    {node.name.length > 18 ? node.name.slice(0, 17) + '\u2026' : node.name}
                  </text>
                  <text x={node.x + 14} y={node.y + 28} fontSize={9} fill="var(--os-text-muted, #8a8d90)">
                    {node.kind}{node.status ? ` \u00b7 ${node.status}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </CardBody>
      </Card>
    </div>
  );
}
