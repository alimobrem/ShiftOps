/**
 * Shared types for agent component renderers.
 */

import type { ComponentSpec } from '../../../engine/agentComponents';

export const MAX_DEPTH = 5;

export interface Props {
  spec: ComponentSpec;
  depth?: number;
  onAddToView?: (spec: ComponentSpec) => void;
  refreshInterval?: number;
  globalTimeRange?: string;
  hoverTimestamp?: number | null;
  onHoverTimestamp?: (ts: number | null) => void;
  onSpecChange?: (spec: ComponentSpec) => void;
  viewId?: string;
}
