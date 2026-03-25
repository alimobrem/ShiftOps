/**
 * Agent Component Specs — structured UI components returned by agent tools.
 *
 * Tools emit these as JSON over the WebSocket `component` event.
 * The frontend renders them inline in the chat using existing primitives.
 */

export type ComponentSpec =
  | DataTableSpec
  | InfoCardGridSpec
  | BadgeListSpec
  | StatusListSpec
  | KeyValueSpec
  | ChartSpec;

export interface DataTableSpec {
  kind: 'data_table';
  title?: string;
  columns: Array<{ id: string; header: string; width?: string }>;
  rows: Array<Record<string, string | number | boolean>>;
}

export interface InfoCardGridSpec {
  kind: 'info_card_grid';
  cards: Array<{ label: string; value: string; sub?: string }>;
}

export interface BadgeListSpec {
  kind: 'badge_list';
  badges: Array<{ text: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }>;
}

export interface StatusListSpec {
  kind: 'status_list';
  title?: string;
  items: Array<{
    name: string;
    status: 'healthy' | 'warning' | 'error' | 'pending' | 'unknown';
    detail?: string;
  }>;
}

export interface KeyValueSpec {
  kind: 'key_value';
  title?: string;
  pairs: Array<{ key: string; value: string }>;
}

export interface ChartSpec {
  kind: 'chart';
  title?: string;
  series: Array<{
    label: string;
    data: Array<[number, number]>; // [timestamp, value]
    color?: string;
  }>;
  yAxisLabel?: string;
  height?: number;
}

/** Max rows persisted to localStorage to prevent bloat */
export const MAX_PERSISTED_ROWS = 50;

/** Truncate a component spec for persistence */
export function truncateForPersistence(spec: ComponentSpec): ComponentSpec {
  if (spec.kind === 'data_table' && spec.rows.length > MAX_PERSISTED_ROWS) {
    return { ...spec, rows: spec.rows.slice(0, MAX_PERSISTED_ROWS) };
  }
  return spec;
}
