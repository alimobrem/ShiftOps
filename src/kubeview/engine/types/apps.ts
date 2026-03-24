/**
 * Apps API (apps/v1) resource types.
 */

import type { ObjectMeta, Condition, LabelSelector, PodTemplateSpec } from './common';

export interface Deployment {
  apiVersion: 'apps/v1';
  kind: 'Deployment';
  metadata: ObjectMeta;
  spec?: {
    replicas?: number;
    selector: LabelSelector;
    template: PodTemplateSpec;
    strategy?: { type?: 'RollingUpdate' | 'Recreate'; rollingUpdate?: { maxUnavailable?: number | string; maxSurge?: number | string } };
    revisionHistoryLimit?: number;
    minReadySeconds?: number;
    paused?: boolean;
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    unavailableReplicas?: number;
    updatedReplicas?: number;
    observedGeneration?: number;
    conditions?: Condition[];
  };
}

export interface StatefulSet {
  apiVersion: 'apps/v1';
  kind: 'StatefulSet';
  metadata: ObjectMeta;
  spec?: {
    replicas?: number;
    selector: LabelSelector;
    template: PodTemplateSpec;
    serviceName: string;
    updateStrategy?: { type?: 'RollingUpdate' | 'OnDelete'; rollingUpdate?: { partition?: number } };
    podManagementPolicy?: 'OrderedReady' | 'Parallel';
    revisionHistoryLimit?: number;
    volumeClaimTemplates?: unknown[];
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    currentReplicas?: number;
    updatedReplicas?: number;
    observedGeneration?: number;
    conditions?: Condition[];
  };
}

export interface DaemonSet {
  apiVersion: 'apps/v1';
  kind: 'DaemonSet';
  metadata: ObjectMeta;
  spec?: {
    selector: LabelSelector;
    template: PodTemplateSpec;
    updateStrategy?: { type?: 'RollingUpdate' | 'OnDelete'; rollingUpdate?: { maxUnavailable?: number | string; maxSurge?: number | string } };
    minReadySeconds?: number;
    revisionHistoryLimit?: number;
  };
  status?: {
    currentNumberScheduled?: number;
    desiredNumberScheduled?: number;
    numberReady?: number;
    numberAvailable?: number;
    numberMisscheduled?: number;
    observedGeneration?: number;
    conditions?: Condition[];
  };
}

export interface ReplicaSet {
  apiVersion: 'apps/v1';
  kind: 'ReplicaSet';
  metadata: ObjectMeta;
  spec?: {
    replicas?: number;
    selector: LabelSelector;
    template: PodTemplateSpec;
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    observedGeneration?: number;
    conditions?: Condition[];
  };
}
