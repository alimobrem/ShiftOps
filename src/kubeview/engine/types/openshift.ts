/**
 * OpenShift-specific resource types.
 */

import type { ObjectMeta, Condition } from './common';

export interface ClusterVersion {
  apiVersion: 'config.openshift.io/v1';
  kind: 'ClusterVersion';
  metadata: ObjectMeta;
  spec?: {
    clusterID?: string;
    channel?: string;
    desiredUpdate?: { version?: string; image?: string; force?: boolean };
    upstream?: string;
  };
  status?: {
    desired?: { version: string; image: string };
    history?: Array<{ state: string; version: string; startedTime?: string; completionTime?: string; image?: string }>;
    conditions?: Condition[];
    availableUpdates?: Array<{ version: string; image?: string }>;
    observedGeneration?: number;
    versionHash?: string;
  };
}

export interface ClusterOperator {
  apiVersion: 'config.openshift.io/v1';
  kind: 'ClusterOperator';
  metadata: ObjectMeta;
  spec?: Record<string, unknown>;
  status?: {
    conditions?: Condition[];
    versions?: Array<{ name: string; version: string }>;
    relatedObjects?: Array<{ group: string; resource: string; namespace?: string; name: string }>;
  };
}

export interface BuildConfig {
  apiVersion: 'build.openshift.io/v1';
  kind: 'BuildConfig';
  metadata: ObjectMeta;
  spec?: {
    source?: { type?: string; git?: { uri: string; ref?: string }; contextDir?: string };
    strategy?: { type?: string; sourceStrategy?: unknown; dockerStrategy?: unknown };
    output?: { to?: { kind: string; name: string } };
    triggers?: Array<{ type: string; [key: string]: unknown }>;
    runPolicy?: string;
  };
  status?: {
    lastVersion?: number;
  };
}

export interface Build {
  apiVersion: 'build.openshift.io/v1';
  kind: 'Build';
  metadata: ObjectMeta;
  spec?: {
    source?: { type?: string; git?: { uri: string; ref?: string } };
    strategy?: { type?: string };
    output?: { to?: { kind: string; name: string } };
  };
  status?: {
    phase?: 'New' | 'Pending' | 'Running' | 'Complete' | 'Failed' | 'Error' | 'Cancelled';
    startTimestamp?: string;
    completionTimestamp?: string;
    duration?: number;
    message?: string;
    reason?: string;
  };
}

export interface ImageStream {
  apiVersion: 'image.openshift.io/v1';
  kind: 'ImageStream';
  metadata: ObjectMeta;
  spec?: {
    lookupPolicy?: { local: boolean };
    tags?: Array<{ name: string; from?: { kind: string; name: string }; importPolicy?: unknown }>;
  };
  status?: {
    dockerImageRepository?: string;
    publicDockerImageRepository?: string;
    tags?: Array<{ tag: string; items?: Array<{ created: string; dockerImageReference: string; image: string }> }>;
  };
}

export interface MachineSet {
  apiVersion: 'machine.openshift.io/v1beta1';
  kind: 'MachineSet';
  metadata: ObjectMeta;
  spec?: {
    replicas?: number;
    selector?: { matchLabels?: Record<string, string> };
    template?: { spec?: { providerSpec?: { value?: Record<string, unknown> } } };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    fullyLabeledReplicas?: number;
    observedGeneration?: number;
  };
}

export interface Machine {
  apiVersion: 'machine.openshift.io/v1beta1';
  kind: 'Machine';
  metadata: ObjectMeta;
  spec?: {
    providerSpec?: { value?: Record<string, unknown> };
  };
  status?: {
    phase?: string;
    nodeRef?: { name: string; kind: string };
    providerStatus?: Record<string, unknown>;
    addresses?: Array<{ type: string; address: string }>;
  };
}

export interface NodePool {
  apiVersion: 'hypershift.openshift.io/v1beta1';
  kind: 'NodePool';
  metadata: ObjectMeta;
  spec?: {
    clusterName?: string;
    replicas?: number;
    autoScaling?: { min?: number; max?: number };
    platform?: {
      type?: string;
      aws?: { instanceType?: string; rootVolume?: { size?: number; type?: string } };
      azure?: { vmSize?: string };
      gcp?: { instanceType?: string };
    };
    release?: { image?: string };
    management?: {
      autoRepair?: boolean;
      upgradeType?: string;
      replace?: { strategy?: string; rollingUpdate?: { maxUnavailable?: number; maxSurge?: number } };
    };
    nodeLabels?: Record<string, string>;
    nodeTaints?: Array<{ key: string; value?: string; effect: string }>;
  };
  status?: {
    replicas?: number;
    version?: string;
    conditions?: Condition[];
  };
}
