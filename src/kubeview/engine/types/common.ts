/**
 * Common K8s sub-types shared across resource interfaces.
 */

export interface ObjectMeta {
  name: string;
  namespace?: string;
  resourceVersion?: string;
  uid?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp?: string;
  ownerReferences?: OwnerReference[];
  deletionTimestamp?: string;
}

export interface OwnerReference {
  apiVersion: string;
  kind: string;
  name: string;
  uid: string;
  controller?: boolean;
  blockOwnerDeletion?: boolean;
}

export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
  lastUpdateTime?: string;
}

export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: Array<{
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
    values?: string[];
  }>;
}

export interface Container {
  name: string;
  image: string;
  ports?: ContainerPort[];
  env?: EnvVar[];
  resources?: ResourceRequirements;
  volumeMounts?: VolumeMount[];
  livenessProbe?: Probe;
  readinessProbe?: Probe;
  startupProbe?: Probe;
  command?: string[];
  args?: string[];
  imagePullPolicy?: string;
}

export interface ContainerPort {
  name?: string;
  containerPort: number;
  protocol?: string;
  hostPort?: number;
}

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: unknown;
}

export interface ResourceRequirements {
  limits?: Record<string, string>;
  requests?: Record<string, string>;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string;
}

export interface Probe {
  httpGet?: { path: string; port: number | string; scheme?: string };
  tcpSocket?: { port: number | string };
  exec?: { command: string[] };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  successThreshold?: number;
}

export interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  started?: boolean;
  state?: {
    running?: { startedAt?: string };
    waiting?: { reason?: string; message?: string };
    terminated?: { reason?: string; exitCode?: number; startedAt?: string; finishedAt?: string };
  };
  lastState?: ContainerStatus['state'];
  image?: string;
  imageID?: string;
  containerID?: string;
}

export interface Taint {
  key: string;
  value?: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
  timeAdded?: string;
}

export interface Toleration {
  key?: string;
  operator?: 'Exists' | 'Equal';
  value?: string;
  effect?: string;
  tolerationSeconds?: number;
}

export interface PodTemplateSpec {
  metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> };
  spec: PodSpec;
}

export interface PodSpec {
  containers: Container[];
  initContainers?: Container[];
  nodeName?: string;
  nodeSelector?: Record<string, string>;
  serviceAccountName?: string;
  tolerations?: Toleration[];
  volumes?: Array<{ name: string; [key: string]: unknown }>;
  restartPolicy?: 'Always' | 'OnFailure' | 'Never';
  terminationGracePeriodSeconds?: number;
  priorityClassName?: string;
  affinity?: unknown;
}
