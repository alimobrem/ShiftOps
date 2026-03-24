/**
 * Argo Rollouts resource types (argoproj.io/v1alpha1).
 * Only present on clusters with Argo Rollouts installed.
 */

import type { ObjectMeta, Condition, LabelSelector, PodTemplateSpec } from './common';

export type RolloutPhase = 'Healthy' | 'Paused' | 'Degraded' | 'Progressing';

export interface CanaryStep {
  setWeight?: number;
  pause?: { duration?: string };
  setCanaryScale?: { weight?: number; replicas?: number; matchTrafficWeight?: boolean };
  analysis?: { templates?: Array<{ templateName: string }> };
  experiment?: { duration?: string; templates?: Array<{ name: string; specRef: string }> };
}

export interface CanaryStrategy {
  canaryService?: string;
  stableService?: string;
  maxSurge?: string | number;
  maxUnavailable?: string | number;
  steps?: CanaryStep[];
  trafficRouting?: {
    istio?: { virtualService?: { name: string; routes?: string[] } };
    nginx?: { stableIngress?: string; annotationPrefix?: string };
    [key: string]: unknown;
  };
  analysis?: {
    templates?: Array<{ templateName: string }>;
    startingStep?: number;
  };
}

export interface BlueGreenStrategy {
  activeService: string;
  previewService?: string;
  autoPromotionEnabled?: boolean;
  autoPromotionSeconds?: number;
  scaleDownDelaySeconds?: number;
  previewReplicaCount?: number;
  antiAffinity?: unknown;
}

export interface Rollout {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'Rollout';
  metadata: ObjectMeta;
  spec?: {
    replicas?: number;
    selector?: LabelSelector;
    template?: PodTemplateSpec;
    strategy?: {
      canary?: CanaryStrategy;
      blueGreen?: BlueGreenStrategy;
    };
    revisionHistoryLimit?: number;
    minReadySeconds?: number;
    workloadRef?: {
      apiVersion: string;
      kind: string;
      name: string;
    };
  };
  status?: {
    phase?: RolloutPhase;
    message?: string;
    currentStepIndex?: number;
    stableRS?: string;
    canary?: {
      weights?: {
        canary?: { weight?: number };
        stable?: { weight?: number };
      };
    };
    canaryWeight?: number;
    currentPodHash?: string;
    availableReplicas?: number;
    readyReplicas?: number;
    replicas?: number;
    updatedReplicas?: number;
    HPAReplicas?: number;
    blueGreen?: {
      activeSelector?: string;
      previewSelector?: string;
    };
    conditions?: Condition[];
    observedGeneration?: string;
  };
}

export interface AnalysisMetric {
  name: string;
  interval?: string;
  count?: number;
  successCondition?: string;
  failureCondition?: string;
  failureLimit?: number;
  inconclusiveLimit?: number;
  provider: {
    prometheus?: { address?: string; query?: string };
    web?: { url?: string; jsonPath?: string };
    job?: { spec?: unknown };
    datadog?: { query?: string };
    newRelic?: { query?: string };
    [key: string]: unknown;
  };
}

export interface AnalysisMetricResult {
  name: string;
  phase: string;
  count?: number;
  successful?: number;
  failed?: number;
  inconclusive?: number;
  measurements?: Array<{
    value: string;
    phase: string;
    startedAt?: string;
    finishedAt?: string;
    message?: string;
  }>;
  message?: string;
}

export interface AnalysisRun {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'AnalysisRun';
  metadata: ObjectMeta;
  spec?: {
    metrics: AnalysisMetric[];
    args?: Array<{ name: string; value?: string }>;
  };
  status?: {
    phase: string;
    message?: string;
    metricResults?: AnalysisMetricResult[];
    startedAt?: string;
    runSummary?: {
      count?: number;
      successful?: number;
      failed?: number;
      inconclusive?: number;
      error?: number;
    };
  };
}

export interface AnalysisTemplate {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'AnalysisTemplate';
  metadata: ObjectMeta;
  spec?: {
    metrics: AnalysisMetric[];
    args?: Array<{ name: string; value?: string }>;
  };
}
