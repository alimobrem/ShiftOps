/**
 * Stub readiness data for development.
 * Will be replaced by the readiness engine when it lands.
 */
import type { ReadinessReport, CategoryResult, ReadinessGate } from './types';
import { computeScore } from './types';

function gate(
  id: string,
  title: string,
  description: string,
  status: ReadinessGate['status'] = 'unknown',
  fixGuidance?: string,
): ReadinessGate {
  return {
    id,
    title,
    description,
    status,
    evidence: status !== 'unknown'
      ? { summary: `Evaluated at ${new Date().toISOString()}`, evaluatedAt: new Date().toISOString() }
      : undefined,
    fixGuidance,
  };
}

export function buildStubReport(): ReadinessReport {
  const categories: CategoryResult[] = [
    {
      id: 'prerequisites',
      label: 'Prerequisites',
      description: 'Cluster basics that must be in place before anything else.',
      gates: [
        gate('prereq-nodes', 'Minimum node count', 'At least 3 control-plane and 2 worker nodes', 'pass'),
        gate('prereq-version', 'Supported OCP version', 'Running a supported OpenShift release', 'pass'),
        gate('prereq-storage', 'Default StorageClass', 'A default StorageClass is configured', 'warn',
          'Run: oc annotate storageclass <name> storageclass.kubernetes.io/is-default-class=true'),
        gate('prereq-dns', 'DNS resolution', 'Cluster DNS resolves internal names', 'pass'),
      ],
    },
    {
      id: 'security',
      label: 'Security',
      description: 'Authentication, authorization, and network policy gates.',
      gates: [
        gate('sec-oauth', 'Identity provider configured', 'At least one non-HTPasswd IdP', 'fail',
          'Configure an external identity provider (LDAP, OIDC, etc.) via OAuth cluster config.'),
        gate('sec-kubeadmin', 'kubeadmin removed', 'The kubeadmin secret should be deleted', 'fail',
          'oc delete secret kubeadmin -n kube-system'),
        gate('sec-tls', 'API/Ingress TLS', 'Custom TLS certificates for API and default ingress', 'warn',
          'Replace self-signed certs with certificates from a trusted CA.'),
        gate('sec-netpol', 'Network policies', 'Default deny + allow rules in user namespaces', 'unknown'),
        gate('sec-scc', 'SCC usage audit', 'No workloads using privileged SCC unnecessarily', 'pass'),
      ],
    },
    {
      id: 'reliability',
      label: 'Reliability',
      description: 'High availability, resource limits, and disruption budgets.',
      gates: [
        gate('rel-ha', 'HA control plane', 'Multiple control-plane replicas', 'pass'),
        gate('rel-pdb', 'PodDisruptionBudgets', 'Critical workloads have PDBs', 'warn',
          'Create PDBs for workloads in production namespaces.'),
        gate('rel-limits', 'Resource requests/limits', 'All pods have CPU/memory requests', 'fail',
          'Add resource requests and limits to all Deployments in production namespaces.'),
        gate('rel-hpa', 'Horizontal autoscaling', 'HPAs configured for variable workloads', 'unknown'),
      ],
    },
    {
      id: 'observability',
      label: 'Observability',
      description: 'Monitoring, alerting, and logging infrastructure.',
      gates: [
        gate('obs-monitoring', 'Cluster monitoring', 'Prometheus stack is healthy', 'pass'),
        gate('obs-alerting', 'Alert receivers', 'AlertManager has configured receivers', 'warn',
          'Configure at least one notification receiver in AlertManager.'),
        gate('obs-logging', 'Cluster logging', 'Log forwarding is configured', 'unknown'),
        gate('obs-metrics', 'User workload monitoring', 'User workload monitoring is enabled', 'pass'),
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      description: 'Backup, update strategy, and operational procedures.',
      gates: [
        gate('ops-backup', 'etcd backup', 'Automated etcd backup schedule exists', 'fail',
          'Configure CronJob-based etcd backups or use an etcd backup operator.'),
        gate('ops-channel', 'Update channel', 'Cluster is on a stable update channel', 'pass'),
        gate('ops-drain', 'Node drain strategy', 'MachineConfig drain strategy is set', 'unknown'),
        gate('ops-quotas', 'Resource quotas', 'Quotas in user namespaces', 'warn',
          'Create ResourceQuotas for all user-facing namespaces.'),
      ],
    },
    {
      id: 'gitops',
      label: 'GitOps',
      description: 'GitOps operator, repository, and application configuration.',
      gates: [
        gate('gitops-operator', 'GitOps operator', 'OpenShift GitOps / ArgoCD is installed', 'unknown'),
        gate('gitops-repo', 'Git repository', 'At least one Application is syncing', 'unknown'),
        gate('gitops-sync', 'Sync health', 'All Applications are synced and healthy', 'unknown'),
      ],
    },
  ];

  return { categories, score: computeScore(categories), evaluatedAt: new Date().toISOString() };
}
