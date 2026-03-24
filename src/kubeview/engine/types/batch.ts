/**
 * Batch API (batch/v1) resource types.
 */

import type { ObjectMeta, Condition, LabelSelector, PodTemplateSpec } from './common';

export interface Job {
  apiVersion: 'batch/v1';
  kind: 'Job';
  metadata: ObjectMeta;
  spec?: {
    parallelism?: number;
    completions?: number;
    backoffLimit?: number;
    activeDeadlineSeconds?: number;
    selector?: LabelSelector;
    template: PodTemplateSpec;
    suspend?: boolean;
    ttlSecondsAfterFinished?: number;
  };
  status?: {
    conditions?: Condition[];
    startTime?: string;
    completionTime?: string;
    active?: number;
    succeeded?: number;
    failed?: number;
  };
}

export interface CronJob {
  apiVersion: 'batch/v1';
  kind: 'CronJob';
  metadata: ObjectMeta;
  spec?: {
    schedule: string;
    jobTemplate: { spec: Job['spec'] };
    concurrencyPolicy?: 'Allow' | 'Forbid' | 'Replace';
    suspend?: boolean;
    successfulJobsHistoryLimit?: number;
    failedJobsHistoryLimit?: number;
    startingDeadlineSeconds?: number;
  };
  status?: {
    active?: Array<{ name: string; namespace: string }>;
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
  };
}
