/**
 * Thin dispatcher — routes each ComponentSpec kind to its domain renderer.
 */

import React, { useMemo } from 'react';
import { normalizeAgentProps } from '../../../engine/normalizeAgentProps';
import { AgentActionButton } from '../AgentActionButton';
import { AgentConfidenceBadge } from '../AgentConfidenceBadge';
import { AgentResolutionTracker } from '../AgentResolutionTracker';
import { AgentBlastRadius } from '../AgentBlastRadius';
import { AgentStatusPipeline } from '../AgentStatusPipeline';
import type {
  ActionButtonSpec,
  ConfidenceBadgeSpec,
  ResolutionTrackerSpec,
  BlastRadiusSpec,
  StatusPipelineSpec,
} from '../../../engine/agentComponents';
import type { Props } from './types';
import { MAX_DEPTH } from './types';

// Domain renderers
import { AgentDataTable, AgentInfoCardGrid, AgentBadgeList, AgentStatusList, AgentKeyValue } from './DataRenderer';
import { AgentTabs, AgentGrid, AgentSection } from './LayoutRenderer';
import {
  ChartSuspense, NodeMapSuspense, TopologySuspense,
  AgentMetricCard, AgentBarList, AgentProgressList, AgentStatCard,
  AgentTimeline, AgentResourceCounts, AgentLogViewer, AgentYamlViewer,
} from './VisualizationRenderer';
import { AgentRelationshipTree, DynamicComponentFallback } from './RelationshipRenderer';

export function AgentComponentRenderer({ spec: rawSpec, depth = 0, onAddToView, refreshInterval, globalTimeRange, hoverTimestamp, onHoverTimestamp, onSpecChange, viewId }: Props) {
  const spec = useMemo(() => normalizeAgentProps(rawSpec), [rawSpec]);
  if (depth > MAX_DEPTH) {
    return <div className="text-xs text-slate-500 italic">Content nested too deeply</div>;
  }
  switch (spec.kind) {
    case 'data_table':
      return <AgentDataTable spec={spec} onAddToView={onAddToView} refreshInterval={refreshInterval} />;
    case 'info_card_grid':
      return <AgentInfoCardGrid spec={spec} />;
    case 'badge_list':
      return <AgentBadgeList spec={spec} />;
    case 'status_list':
      return <AgentStatusList spec={spec} />;
    case 'key_value':
      return <AgentKeyValue spec={spec} />;
    case 'chart':
      return <ChartSuspense spec={spec} onAddToView={onAddToView} refreshInterval={refreshInterval} globalTimeRange={globalTimeRange} hoverTimestamp={hoverTimestamp} onHoverTimestamp={onHoverTimestamp} onSpecChange={onSpecChange} />;
    case 'tabs':
      return <AgentTabs spec={spec} depth={depth} />;
    case 'grid':
      return <AgentGrid spec={spec} depth={depth} />;
    case 'section':
      return <AgentSection spec={spec} depth={depth} />;
    case 'relationship_tree':
      return <AgentRelationshipTree spec={spec} onAddToView={onAddToView} />;
    case 'log_viewer':
      return <AgentLogViewer spec={spec} />;
    case 'yaml_viewer':
      return <AgentYamlViewer spec={spec} />;
    case 'metric_card':
      return <AgentMetricCard spec={spec} />;
    case 'node_map':
      return <NodeMapSuspense spec={spec} />;
    case 'bar_list':
      return <AgentBarList spec={spec} />;
    case 'progress_list':
      return <AgentProgressList spec={spec} />;
    case 'stat_card':
      return <AgentStatCard spec={spec} />;
    case 'timeline':
      return <AgentTimeline spec={spec} />;
    case 'resource_counts':
      return <AgentResourceCounts spec={spec} />;
    case 'topology':
      return <TopologySuspense spec={spec} onAddToView={onAddToView} />;
    case 'action_button':
      return <AgentActionButton spec={spec as ActionButtonSpec} viewId={viewId} />;
    case 'confidence_badge':
      return <AgentConfidenceBadge spec={spec as ConfidenceBadgeSpec} />;
    case 'resolution_tracker':
      return <AgentResolutionTracker spec={spec as ResolutionTrackerSpec} />;
    case 'blast_radius':
      return <AgentBlastRadius spec={spec as BlastRadiusSpec} />;
    case 'status_pipeline':
      return <AgentStatusPipeline spec={spec as StatusPipelineSpec} />;
    default:
      return <DynamicComponentFallback spec={spec} />;
  }
}
