export interface Snippet {
  prefix: string;         // trigger text, e.g., "deploy"
  label: string;          // display name
  description: string;
  body: string;           // YAML template with ${1:placeholder} markers
}

// Built-in snippets for common Kubernetes resources
export const snippets: Snippet[] = [
  {
    prefix: 'deploy',
    label: 'Deployment',
    description: 'Create a Deployment',
    body: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${1:my-app}
  namespace: \${2:default}
spec:
  replicas: \${3:1}
  selector:
    matchLabels:
      app: \${1:my-app}
  template:
    metadata:
      labels:
        app: \${1:my-app}
    spec:
      containers:
      - name: \${1:my-app}
        image: \${4:nginx:latest}
        ports:
        - containerPort: \${5:80}`,
  },
  {
    prefix: 'svc',
    label: 'Service',
    description: 'Create a Service (ClusterIP)',
    body: `apiVersion: v1
kind: Service
metadata:
  name: \${1:my-service}
  namespace: \${2:default}
spec:
  type: ClusterIP
  selector:
    app: \${3:my-app}
  ports:
  - name: \${4:http}
    port: \${5:80}
    targetPort: \${6:8080}
    protocol: TCP`,
  },
  {
    prefix: 'ing',
    label: 'Ingress',
    description: 'Create an Ingress',
    body: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: \${1:my-ingress}
  namespace: \${2:default}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: \${3:example.com}
    http:
      paths:
      - path: /\${4:path}
        pathType: Prefix
        backend:
          service:
            name: \${5:my-service}
            port:
              number: \${6:80}`,
  },
  {
    prefix: 'pvc',
    label: 'PersistentVolumeClaim',
    description: 'Create a PersistentVolumeClaim',
    body: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: \${1:my-pvc}
  namespace: \${2:default}
spec:
  accessModes:
  - \${3:ReadWriteOnce}
  resources:
    requests:
      storage: \${4:10Gi}
  storageClassName: \${5:standard}`,
  },
  {
    prefix: 'pvc-rwx',
    label: 'PVC (ReadWriteMany)',
    description: 'Shared PVC for multiple pods (requires RWX-capable storage)',
    body: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: \${1:shared-data}
  namespace: \${2:default}
spec:
  accessModes:
  - ReadWriteMany
  resources:
    requests:
      storage: \${3:50Gi}
  storageClassName: \${4:ocs-storagecluster-cephfs}`,
  },
  {
    prefix: 'pvc-block',
    label: 'PVC (Block Volume)',
    description: 'Raw block device PVC for databases or high-performance I/O',
    body: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: \${1:db-block-volume}
  namespace: \${2:default}
spec:
  accessModes:
  - ReadWriteOnce
  volumeMode: Block
  resources:
    requests:
      storage: \${3:100Gi}
  storageClassName: \${4:gp3-csi}`,
  },
  {
    prefix: 'pvc-snapshot',
    label: 'PVC from Snapshot',
    description: 'Create a PVC from an existing VolumeSnapshot (clone/restore)',
    body: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: \${1:restored-data}
  namespace: \${2:default}
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: \${3:10Gi}
  storageClassName: \${4:gp3-csi}
  dataSource:
    name: \${5:my-snapshot}
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io`,
  },
  {
    prefix: 'pvc-clone',
    label: 'PVC Clone',
    description: 'Clone an existing PVC (creates a copy of the data)',
    body: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: \${1:cloned-data}
  namespace: \${2:default}
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: \${3:10Gi}
  storageClassName: \${4:gp3-csi}
  dataSource:
    name: \${5:source-pvc}
    kind: PersistentVolumeClaim`,
  },
  {
    prefix: 'volumesnapshot',
    label: 'VolumeSnapshot',
    description: 'Create a point-in-time snapshot of a PVC',
    body: `apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: \${1:my-snapshot}
  namespace: \${2:default}
spec:
  volumeSnapshotClassName: \${3:csi-snapclass}
  source:
    persistentVolumeClaimName: \${4:my-pvc}`,
  },
  {
    prefix: 'storageclass',
    label: 'StorageClass',
    description: 'Create a StorageClass for dynamic provisioning',
    body: `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: \${1:fast-storage}
  annotations:
    storageclass.kubernetes.io/is-default-class: "\${2:false}"
provisioner: \${3:kubernetes.io/aws-ebs}
parameters:
  type: \${4:gp3}
reclaimPolicy: \${5:Retain}
volumeBindingMode: \${6:WaitForFirstConsumer}
allowVolumeExpansion: true`,
  },
  {
    prefix: 'cm',
    label: 'ConfigMap',
    description: 'Create a ConfigMap',
    body: `apiVersion: v1
kind: ConfigMap
metadata:
  name: \${1:my-config}
  namespace: \${2:default}
data:
  \${3:key}: \${4:value}`,
  },
  {
    prefix: 'secret',
    label: 'Secret',
    description: 'Create a Secret (Opaque)',
    body: `apiVersion: v1
kind: Secret
metadata:
  name: \${1:my-secret}
  namespace: \${2:default}
type: Opaque
data:
  \${3:key}: \${4:base64-encoded-value}`,
  },
  {
    prefix: 'rb',
    label: 'RoleBinding',
    description: 'Create a RoleBinding',
    body: `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: \${1:my-role-binding}
  namespace: \${2:default}
subjects:
- kind: \${3:User}
  name: \${4:jane}
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: \${5:pod-reader}
  apiGroup: rbac.authorization.k8s.io`,
  },
  {
    prefix: 'cj',
    label: 'CronJob',
    description: 'Create a CronJob',
    body: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: \${1:my-cronjob}
  namespace: \${2:default}
spec:
  schedule: "\${3:0 0 * * *}"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: \${4:job}
            image: \${5:busybox:latest}
            command:
            - /bin/sh
            - -c
            - \${6:date; echo Hello from CronJob}
          restartPolicy: OnFailure`,
  },
  {
    prefix: 'hpa',
    label: 'HorizontalPodAutoscaler',
    description: 'Create a HorizontalPodAutoscaler',
    body: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: \${1:my-hpa}
  namespace: \${2:default}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: \${3:my-app}
  minReplicas: \${4:1}
  maxReplicas: \${5:10}
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: \${6:80}`,
  },
  {
    prefix: 'ns',
    label: 'Namespace',
    description: 'Create a Namespace',
    body: `apiVersion: v1
kind: Namespace
metadata:
  name: \${1:my-namespace}`,
  },
  {
    prefix: 'sa',
    label: 'ServiceAccount',
    description: 'Create a ServiceAccount',
    body: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: \${1:my-service-account}
  namespace: \${2:default}`,
  },
  {
    prefix: 'np',
    label: 'NetworkPolicy',
    description: 'Create a NetworkPolicy',
    body: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: \${1:my-network-policy}
  namespace: \${2:default}
spec:
  podSelector:
    matchLabels:
      \${3:app}: \${4:my-app}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          \${5:app}: \${6:frontend}
    ports:
    - protocol: TCP
      port: \${7:80}
  egress:
  - to:
    - podSelector:
        matchLabels:
          \${8:app}: \${9:backend}
    ports:
    - protocol: TCP
      port: \${10:8080}`,
  },
  {
    prefix: 'clusterautoscaler',
    label: 'ClusterAutoscaler',
    description: 'Enable cluster-wide node autoscaling',
    body: `apiVersion: autoscaling.openshift.io/v1
kind: ClusterAutoscaler
metadata:
  name: default
spec:
  resourceLimits:
    maxNodesTotal: \${1:24}
    cores:
      min: \${2:8}
      max: \${3:128}
    memory:
      min: \${4:32}
      max: \${5:512}
  scaleDown:
    enabled: true
    delayAfterAdd: \${6:10m}
    delayAfterDelete: \${7:5m}
    unneededTime: \${8:5m}
  logVerbosity: 4`,
  },
  {
    prefix: 'machineautoscaler',
    label: 'MachineAutoscaler',
    description: 'Set min/max replicas for a MachineSet',
    body: `apiVersion: autoscaling.openshift.io/v1beta1
kind: MachineAutoscaler
metadata:
  name: \${1:worker-us-east-1a}
  namespace: openshift-machine-api
spec:
  minReplicas: \${2:1}
  maxReplicas: \${3:6}
  scaleTargetRef:
    apiVersion: machine.openshift.io/v1beta1
    kind: MachineSet
    name: \${4:my-cluster-worker-us-east-1a}`,
  },
  {
    prefix: 'sub-logging',
    label: 'Cluster Logging Operator',
    description: 'Install the Cluster Logging Operator (CLO) for log collection',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: cluster-logging
  namespace: openshift-logging
spec:
  channel: \${1:stable-6.1}
  name: cluster-logging
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'sub-loki',
    label: 'Loki Operator',
    description: 'Install Loki for scalable log storage',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: loki-operator
  namespace: openshift-operators-redhat
spec:
  channel: \${1:stable-6.1}
  name: loki-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'sub-coo',
    label: 'Cluster Observability Operator',
    description: 'Install COO for monitoring, tracing, and dashboards',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: cluster-observability-operator
  namespace: openshift-operators
spec:
  channel: \${1:stable}
  name: cluster-observability-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'sub-externalsecrets',
    label: 'External Secrets Operator',
    description: 'Install External Secrets for Vault/AWS/GCP secret sync',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: external-secrets-operator
  namespace: openshift-operators
spec:
  channel: \${1:stable}
  name: external-secrets-operator
  source: community-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'lokistack',
    label: 'LokiStack',
    description: 'Create a LokiStack instance for log storage',
    body: `apiVersion: loki.grafana.com/v1
kind: LokiStack
metadata:
  name: \${1:logging-loki}
  namespace: openshift-logging
spec:
  size: \${2:1x.small}
  storage:
    schemas:
    - version: v13
      effectiveDate: "2024-10-25"
    secret:
      name: \${3:logging-loki-s3}
      type: \${4:s3}
  storageClassName: \${5:gp3-csi}
  tenants:
    mode: openshift-logging`,
  },
  {
    prefix: 'clusterlogforwarder',
    label: 'ClusterLogForwarder',
    description: 'Configure log collection and forwarding to LokiStack',
    body: `apiVersion: observability.openshift.io/v1
kind: ClusterLogForwarder
metadata:
  name: \${1:collector}
  namespace: openshift-logging
spec:
  serviceAccount:
    name: \${2:cluster-logging}
  outputs:
  - name: default-lokistack
    type: lokiStack
    lokiStack:
      target:
        name: \${3:logging-loki}
        namespace: openshift-logging
      authentication:
        token:
          from: serviceAccount
  pipelines:
  - name: default
    inputRefs:
    - application
    - infrastructure
    outputRefs:
    - default-lokistack`,
  },
  {
    prefix: 'sub-oadp',
    label: 'OADP Operator (Backup)',
    description: 'Install OpenShift API for Data Protection for etcd and application backup',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: redhat-oadp-operator
  namespace: openshift-adp
spec:
  channel: \${1:stable-1.4}
  name: redhat-oadp-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'sub-quay',
    label: 'Quay Operator',
    description: 'Install Red Hat Quay for enterprise container registry',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: quay-operator
  namespace: openshift-operators
spec:
  channel: \${1:stable-3.13}
  name: quay-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
  {
    prefix: 'sub-gitops',
    label: 'OpenShift GitOps (ArgoCD)',
    description: 'Install OpenShift GitOps for declarative cluster management',
    body: `apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-gitops-operator
  namespace: openshift-operators
spec:
  channel: \${1:latest}
  name: openshift-gitops-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: \${2:Automatic}`,
  },
];

/**
 * Get snippet suggestions for a given prefix
 */
export function getSnippetSuggestions(prefix: string): Snippet[] {
  const lowercasePrefix = prefix.toLowerCase();
  return snippets.filter(
    snippet =>
      snippet.prefix.toLowerCase().includes(lowercasePrefix) ||
      snippet.label.toLowerCase().includes(lowercasePrefix) ||
      snippet.description.toLowerCase().includes(lowercasePrefix)
  );
}

/**
 * Resolve a snippet body by replacing ${N:default} with default values
 * This is a simplified version - a real implementation would support tab stops
 */
export function resolveSnippet(snippet: Snippet): string {
  let resolved = snippet.body;

  // Replace ${N:default} with just the default value
  resolved = resolved.replace(/\$\{(\d+):([^}]+)\}/g, (_match, _index, defaultValue) => {
    return defaultValue;
  });

  // Replace ${N} with empty string
  resolved = resolved.replace(/\$\{\d+\}/g, '');

  return resolved;
}
