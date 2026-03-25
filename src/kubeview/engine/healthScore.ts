/**
 * Health Score — composite cluster health calculation.
 * Score 0-100: green (90+), yellow (70-89), orange (50-69), red (<50).
 */

import type { ClusterConnection } from './clusterConnection';

export interface HealthScoreInput {
  nodeCount: number;
  nodeReadyCount: number;
  podCount: number;
  podFailedCount: number;
  operatorCount: number;
  operatorDegradedCount: number;
  alertCriticalCount: number;
  alertWarningCount: number;
}

export interface HealthScoreResult {
  score: number;
  grade: 'healthy' | 'warning' | 'degraded' | 'critical';
  color: string;
  factors: Array<{ label: string; impact: number; detail: string }>;
}

export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  let score = 100;
  const factors: HealthScoreResult['factors'] = [];

  // Node health (30% weight)
  if (input.nodeCount > 0) {
    const nodeRatio = input.nodeReadyCount / input.nodeCount;
    const nodeImpact = Math.round((1 - nodeRatio) * 30);
    if (nodeImpact > 0) {
      score -= nodeImpact;
      factors.push({ label: 'Nodes', impact: -nodeImpact, detail: `${input.nodeReadyCount}/${input.nodeCount} ready` });
    }
  }

  // Operator health (25% weight)
  if (input.operatorCount > 0) {
    const opRatio = input.operatorDegradedCount / input.operatorCount;
    const opImpact = Math.round(opRatio * 25);
    if (opImpact > 0) {
      score -= opImpact;
      factors.push({ label: 'Operators', impact: -opImpact, detail: `${input.operatorDegradedCount} degraded` });
    }
  }

  // Critical alerts (25% weight)
  if (input.alertCriticalCount > 0) {
    const alertImpact = Math.min(25, input.alertCriticalCount * 8);
    score -= alertImpact;
    factors.push({ label: 'Critical Alerts', impact: -alertImpact, detail: `${input.alertCriticalCount} firing` });
  }

  // Warning alerts (10% weight)
  if (input.alertWarningCount > 0) {
    const warnImpact = Math.min(10, input.alertWarningCount * 2);
    score -= warnImpact;
    factors.push({ label: 'Warnings', impact: -warnImpact, detail: `${input.alertWarningCount} firing` });
  }

  // Pod failures (10% weight)
  if (input.podCount > 0 && input.podFailedCount > 0) {
    const podRatio = input.podFailedCount / input.podCount;
    const podImpact = Math.round(Math.min(10, podRatio * 50));
    if (podImpact > 0) {
      score -= podImpact;
      factors.push({ label: 'Pods', impact: -podImpact, detail: `${input.podFailedCount} failed` });
    }
  }

  score = Math.max(0, Math.min(100, score));

  const grade: HealthScoreResult['grade'] =
    score >= 90 ? 'healthy' :
    score >= 70 ? 'warning' :
    score >= 50 ? 'degraded' :
    'critical';

  const color =
    score >= 90 ? 'text-emerald-400' :
    score >= 70 ? 'text-amber-400' :
    score >= 50 ? 'text-orange-400' :
    'text-red-400';

  return { score, grade, color, factors };
}

export function healthGradeColor(grade: HealthScoreResult['grade']): string {
  switch (grade) {
    case 'healthy': return 'bg-emerald-500';
    case 'warning': return 'bg-amber-500';
    case 'degraded': return 'bg-orange-500';
    case 'critical': return 'bg-red-500';
  }
}
