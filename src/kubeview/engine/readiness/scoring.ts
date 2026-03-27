/**
 * Readiness Scoring — weighted score computation for production readiness.
 *
 * Weights by priority:
 *   blocking = 4, recommended = 2, optional = 1
 *
 * A waived gate counts as "passed" for scoring purposes (unless expired).
 * The production-ready threshold is 80%.
 */

import type {
  GatePriority,
  GateResult,
  GateStatus,
  ReadinessCategory,
  ReadinessReport,
  CategorySummary,
  Waiver,
} from './types';
import { ALL_GATES } from './gates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_WEIGHTS: Record<GatePriority, number> = {
  blocking: 4,
  recommended: 2,
  optional: 1,
};

/** Score threshold to be considered production-ready */
const PRODUCTION_READY_THRESHOLD = 80;

/** Score awarded per status (as a fraction of the gate's weight) */
const STATUS_MULTIPLIER: Record<GateStatus, number> = {
  passed: 1.0,
  needs_attention: 0.5,
  waived: 1.0,
  checking: 0.0,
  failed: 0.0,
  not_started: 0.0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a lookup from gate ID to its priority */
function buildPriorityMap(): Record<string, GatePriority> {
  const map: Record<string, GatePriority> = {};
  for (const gate of ALL_GATES) {
    map[gate.id] = gate.priority;
  }
  return map;
}

/** Build a lookup from gate ID to its category */
function buildCategoryMap(): Record<string, ReadinessCategory> {
  const map: Record<string, ReadinessCategory> = {};
  for (const gate of ALL_GATES) {
    map[gate.id] = gate.category;
  }
  return map;
}

/** Check if a waiver is currently active (not expired) */
function isWaiverActive(waiver: Waiver): boolean {
  if (waiver.expiresAt === null) return true;
  return waiver.expiresAt > Date.now();
}

/**
 * Resolve the effective status of a gate, considering waivers.
 * A waived gate is treated as 'passed' for scoring.
 */
function effectiveStatus(result: GateResult, waiver?: Waiver): GateStatus {
  if (waiver && isWaiverActive(waiver) && result.status !== 'passed') {
    return 'waived';
  }
  return result.status;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a weighted readiness score from gate results and waivers.
 *
 * @returns A score between 0 and 100 (inclusive)
 */
export function computeScore(
  results: Record<string, GateResult>,
  waivers: Record<string, Waiver> = {},
): number {
  const priorityMap = buildPriorityMap();
  let totalWeight = 0;
  let earned = 0;

  for (const [gateId, result] of Object.entries(results)) {
    const priority = priorityMap[gateId] ?? 'recommended';
    const weight = PRIORITY_WEIGHTS[priority];
    totalWeight += weight;

    const status = effectiveStatus(result, waivers[gateId]);
    earned += weight * STATUS_MULTIPLIER[status];
  }

  if (totalWeight === 0) return 0;
  return Math.round((earned / totalWeight) * 100);
}

/**
 * Returns true if the cluster meets the production-ready threshold.
 */
export function isProductionReady(
  results: Record<string, GateResult>,
  waivers: Record<string, Waiver> = {},
): boolean {
  const score = computeScore(results, waivers);
  if (score < PRODUCTION_READY_THRESHOLD) return false;

  // Even with a high score, any blocking gate that is 'failed' blocks readiness
  const priorityMap = buildPriorityMap();
  for (const [gateId, result] of Object.entries(results)) {
    if (priorityMap[gateId] === 'blocking') {
      const status = effectiveStatus(result, waivers[gateId]);
      if (status === 'failed') return false;
    }
  }

  return true;
}

/**
 * Build a full ReadinessReport from gate results and waivers.
 */
export function buildReport(
  results: Record<string, GateResult>,
  waivers: Record<string, Waiver> = {},
): ReadinessReport {
  const categoryMap = buildCategoryMap();
  const priorityMap = buildPriorityMap();

  // Init category summaries
  const categories: Record<string, CategorySummary> = {};
  const allCategories: ReadinessCategory[] = [
    'prerequisites', 'security', 'observability', 'reliability', 'operations', 'gitops',
  ];
  for (const cat of allCategories) {
    categories[cat] = { passed: 0, failed: 0, needs_attention: 0, not_started: 0, total: 0, score: 0 };
  }

  // Tally per-category
  const catWeights: Record<string, { total: number; earned: number }> = {};
  for (const cat of allCategories) {
    catWeights[cat] = { total: 0, earned: 0 };
  }

  for (const [gateId, result] of Object.entries(results)) {
    const cat = categoryMap[gateId];
    if (!cat || !categories[cat]) continue;

    const status = effectiveStatus(result, waivers[gateId]);
    if (status === 'passed' || status === 'waived') categories[cat].passed++;
    else if (status === 'failed') categories[cat].failed++;
    else if (status === 'needs_attention') categories[cat].needs_attention++;
    else categories[cat].not_started++;
    categories[cat].total++;

    const priority = priorityMap[gateId] ?? 'recommended';
    const weight = PRIORITY_WEIGHTS[priority];
    catWeights[cat].total += weight;
    catWeights[cat].earned += weight * STATUS_MULTIPLIER[status];
  }

  // Compute per-category scores
  for (const cat of allCategories) {
    const w = catWeights[cat];
    categories[cat].score = w.total > 0 ? Math.round((w.earned / w.total) * 100) : 0;
  }

  const score = computeScore(results, waivers);

  return {
    score,
    productionReady: isProductionReady(results, waivers),
    results,
    waivers,
    categories: categories as Record<ReadinessCategory, CategorySummary>,
    generatedAt: Date.now(),
  };
}
