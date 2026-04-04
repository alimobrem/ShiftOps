/**
 * Layout Template Registry — predefined arrangements for custom views.
 *
 * Templates define named slots with grid positions and expected component kinds.
 * The agent picks a template by ID, produces the right component kinds, and
 * applyTemplate() maps them to positions in the 4-column react-grid-layout grid.
 */

import type { ComponentSpec } from './agentComponents';

export interface LayoutSlot {
  name: string;
  expectedKinds: ComponentSpec['kind'][];
  position: { x: number; y: number; w: number; h: number };
  description: string;
  optional?: boolean;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  slots: LayoutSlot[];
  tags?: string[];
}

// ─── Template Definitions ────────────────────────────────────────────────────

const TEMPLATES: LayoutTemplate[] = [
  {
    id: 'sre_dashboard',
    name: 'SRE Dashboard',
    description: '4 metric cards across top, 2 charts side-by-side, full-width table',
    tags: ['sre', 'monitoring', 'overview'],
    slots: [
      { name: 'metric1', expectedKinds: ['metric_card', 'info_card_grid', 'grid'], position: { x: 0, y: 0, w: 1, h: 2 }, description: 'Top-left metric' },
      { name: 'metric2', expectedKinds: ['metric_card', 'info_card_grid', 'grid'], position: { x: 1, y: 0, w: 1, h: 2 }, description: 'Second metric' },
      { name: 'metric3', expectedKinds: ['metric_card', 'info_card_grid', 'grid'], position: { x: 2, y: 0, w: 1, h: 2 }, description: 'Third metric' },
      { name: 'metric4', expectedKinds: ['metric_card', 'info_card_grid', 'grid'], position: { x: 3, y: 0, w: 1, h: 2 }, description: 'Fourth metric', optional: true },
      { name: 'chart_left', expectedKinds: ['chart'], position: { x: 0, y: 2, w: 2, h: 5 }, description: 'Left chart' },
      { name: 'chart_right', expectedKinds: ['chart'], position: { x: 2, y: 2, w: 2, h: 5 }, description: 'Right chart', optional: true },
      { name: 'table', expectedKinds: ['data_table', 'status_list'], position: { x: 0, y: 7, w: 4, h: 6 }, description: 'Full-width table' },
    ],
  },
  {
    id: 'namespace_overview',
    name: 'Namespace Overview',
    description: 'Summary cards, 2-column charts, data table, events log',
    tags: ['namespace', 'overview', 'workloads'],
    slots: [
      { name: 'summary', expectedKinds: ['info_card_grid', 'grid'], position: { x: 0, y: 0, w: 4, h: 2 }, description: 'Summary cards' },
      { name: 'chart_left', expectedKinds: ['chart'], position: { x: 0, y: 2, w: 2, h: 5 }, description: 'Left chart (CPU/memory)', optional: true },
      { name: 'chart_right', expectedKinds: ['chart'], position: { x: 2, y: 2, w: 2, h: 5 }, description: 'Right chart', optional: true },
      { name: 'table', expectedKinds: ['data_table'], position: { x: 0, y: 7, w: 4, h: 6 }, description: 'Pod/workload table' },
      { name: 'events', expectedKinds: ['log_viewer', 'data_table'], position: { x: 0, y: 13, w: 4, h: 5 }, description: 'Events or logs', optional: true },
    ],
  },
  {
    id: 'incident_report',
    name: 'Incident Report',
    description: 'Status timeline, logs + details side-by-side, evidence table',
    tags: ['incident', 'debugging', 'triage'],
    slots: [
      { name: 'timeline', expectedKinds: ['status_list', 'badge_list'], position: { x: 0, y: 0, w: 4, h: 3 }, description: 'Status timeline or severity badges' },
      { name: 'logs', expectedKinds: ['log_viewer'], position: { x: 0, y: 3, w: 2, h: 6 }, description: 'Log output' },
      { name: 'details', expectedKinds: ['key_value', 'yaml_viewer'], position: { x: 2, y: 3, w: 2, h: 6 }, description: 'Key details or YAML' },
      { name: 'evidence', expectedKinds: ['data_table'], position: { x: 0, y: 9, w: 4, h: 5 }, description: 'Evidence table', optional: true },
    ],
  },
  {
    id: 'monitoring_panel',
    name: 'Monitoring Panel',
    description: '4 metric cards, 2x2 chart grid, alert list',
    tags: ['monitoring', 'metrics', 'alerts'],
    slots: [
      { name: 'metric1', expectedKinds: ['metric_card'], position: { x: 0, y: 0, w: 1, h: 2 }, description: 'Metric 1' },
      { name: 'metric2', expectedKinds: ['metric_card'], position: { x: 1, y: 0, w: 1, h: 2 }, description: 'Metric 2' },
      { name: 'metric3', expectedKinds: ['metric_card'], position: { x: 2, y: 0, w: 1, h: 2 }, description: 'Metric 3' },
      { name: 'metric4', expectedKinds: ['metric_card'], position: { x: 3, y: 0, w: 1, h: 2 }, description: 'Metric 4', optional: true },
      { name: 'chart_tl', expectedKinds: ['chart'], position: { x: 0, y: 2, w: 2, h: 5 }, description: 'Top-left chart' },
      { name: 'chart_tr', expectedKinds: ['chart'], position: { x: 2, y: 2, w: 2, h: 5 }, description: 'Top-right chart', optional: true },
      { name: 'alerts', expectedKinds: ['status_list', 'data_table'], position: { x: 0, y: 7, w: 4, h: 5 }, description: 'Alert list or status' },
    ],
  },
  {
    id: 'resource_detail',
    name: 'Resource Detail',
    description: 'Key-value details + resource tree, YAML viewer, related table',
    tags: ['resource', 'detail', 'debugging'],
    slots: [
      { name: 'details', expectedKinds: ['key_value'], position: { x: 0, y: 0, w: 2, h: 5 }, description: 'Resource details' },
      { name: 'tree', expectedKinds: ['relationship_tree', 'status_list'], position: { x: 2, y: 0, w: 2, h: 5 }, description: 'Resource tree or status' },
      { name: 'yaml', expectedKinds: ['yaml_viewer', 'log_viewer'], position: { x: 0, y: 5, w: 4, h: 5 }, description: 'YAML manifest or logs' },
      { name: 'related', expectedKinds: ['data_table'], position: { x: 0, y: 10, w: 4, h: 5 }, description: 'Related resources', optional: true },
    ],
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const LAYOUT_TEMPLATES: Record<string, LayoutTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

// ─── Template Application ────────────────────────────────────────────────────

type Position = { x: number; y: number; w: number; h: number };

/**
 * Apply a layout template to an array of components.
 * Matches components to slots by kind (greedy first-match).
 * Unmatched components are appended full-width at the bottom.
 */
export function applyTemplate(
  templateId: string,
  components: ComponentSpec[],
): { layout: ComponentSpec[]; positions: Record<number, Position> } | null {
  const template = LAYOUT_TEMPLATES[templateId];
  if (!template) return null;

  const layout: ComponentSpec[] = [];
  const positions: Record<number, Position> = {};
  const used = new Set<number>();

  // Match components to slots
  for (const slot of template.slots) {
    const idx = components.findIndex(
      (c, i) => !used.has(i) && slot.expectedKinds.includes(c.kind),
    );
    if (idx >= 0) {
      used.add(idx);
      const pos = layout.length;
      layout.push(components[idx]);
      positions[pos] = { ...slot.position };
    }
  }

  // Append unmatched components full-width at the bottom
  let nextY = Object.values(positions).reduce((max, p) => Math.max(max, p.y + p.h), 0);
  for (let i = 0; i < components.length; i++) {
    if (!used.has(i)) {
      const pos = layout.length;
      layout.push(components[i]);
      positions[pos] = { x: 0, y: nextY, w: 4, h: 5 };
      nextY += 5;
    }
  }

  return { layout, positions };
}
