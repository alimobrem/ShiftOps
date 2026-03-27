/** Stub types for the readiness engine — to be replaced when the engine lands. */

export type GateStatus = 'pass' | 'fail' | 'warn' | 'unknown' | 'waived' | 'loading';

export interface GateEvidence {
  /** Short human-readable finding, e.g. "3 of 5 nodes are Ready" */
  summary: string;
  /** Optional raw data for drill-down */
  details?: string;
  /** Timestamp of last evaluation */
  evaluatedAt?: string;
}

export interface ReadinessGate {
  id: string;
  title: string;
  description: string;
  status: GateStatus;
  evidence?: GateEvidence;
  /** Markdown or plain-text guidance on how to remediate */
  fixGuidance?: string;
  /** If waived, the reason provided */
  waiverReason?: string;
}

export type ReadinessCategory =
  | 'prerequisites'
  | 'security'
  | 'reliability'
  | 'observability'
  | 'operations'
  | 'gitops';

export interface CategoryResult {
  id: ReadinessCategory;
  label: string;
  description: string;
  gates: ReadinessGate[];
}

export interface ReadinessReport {
  categories: CategoryResult[];
  /** 0-100 overall score */
  score: number;
  evaluatedAt: string;
}

/** Whether the user is seeing the wizard (first-run) or checklist (returning) */
export type OnboardingMode = 'wizard' | 'checklist';

/** Compute a 0-100 score from categories based on pass/waived gate count. */
export function computeScore(categories: CategoryResult[]): number {
  const total = categories.reduce((s, c) => s + c.gates.length, 0);
  const passed = categories.reduce(
    (s, c) => s + c.gates.filter((g) => g.status === 'pass' || g.status === 'waived').length,
    0,
  );
  return total > 0 ? Math.round((passed / total) * 100) : 0;
}
