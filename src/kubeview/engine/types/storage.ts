/**
 * Storage resource types.
 */

import type { ObjectMeta, Condition } from './common';

export interface StorageClass {
  apiVersion: 'storage.k8s.io/v1';
  kind: 'StorageClass';
  metadata: ObjectMeta;
  provisioner: string;
  parameters?: Record<string, string>;
  reclaimPolicy?: 'Retain' | 'Delete' | 'Recycle';
  volumeBindingMode?: 'Immediate' | 'WaitForFirstConsumer';
  allowVolumeExpansion?: boolean;
  mountOptions?: string[];
}

export interface VolumeSnapshot {
  apiVersion: 'snapshot.storage.k8s.io/v1';
  kind: 'VolumeSnapshot';
  metadata: ObjectMeta;
  spec?: {
    source: { persistentVolumeClaimName?: string; volumeSnapshotContentName?: string };
    volumeSnapshotClassName?: string;
  };
  status?: {
    readyToUse?: boolean;
    creationTime?: string;
    restoreSize?: string;
    boundVolumeSnapshotContentName?: string;
    error?: { time?: string; message?: string };
  };
}

export interface CSIDriver {
  apiVersion: 'storage.k8s.io/v1';
  kind: 'CSIDriver';
  metadata: ObjectMeta;
  spec?: {
    attachRequired?: boolean;
    podInfoOnMount?: boolean;
    volumeLifecycleModes?: string[];
    storageCapacity?: boolean;
    fsGroupPolicy?: string;
  };
}
