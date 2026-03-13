/**
 * Ownership & Management Detection
 *
 * Detects who/what manages a K8s resource by inspecting:
 * 1. metadata.labels["app.kubernetes.io/managed-by"]
 * 2. metadata.annotations (helm, argocd, kubectl)
 * 3. metadata.managedFields[].manager
 * 4. metadata.ownerReferences
 */

export interface OwnershipInfo {
  /** The management tool/system: Helm, ArgoCD, Operator, kubectl, Console, Unknown */
  manager: string;
  /** Extra detail: release name, argocd app, operator CSV, etc. */
  detail?: string;
  /** Whether edits may be overwritten by the controller */
  willOverwrite: boolean;
  /** Warning message for editing */
  warning?: string;
  /** Color for the badge */
  color: 'blue' | 'purple' | 'teal' | 'orange' | 'green' | 'grey';
}

interface ManagedField {
  manager?: string;
  operation?: string;
  time?: string;
}

export function detectOwnership(resource: Record<string, unknown>): OwnershipInfo {
  const metadata = (resource['metadata'] ?? {}) as Record<string, unknown>;
  const labels = (metadata['labels'] ?? {}) as Record<string, string>;
  const annotations = (metadata['annotations'] ?? {}) as Record<string, string>;
  const managedFields = (metadata['managedFields'] ?? []) as ManagedField[];
  const ownerRefs = (metadata['ownerReferences'] ?? []) as Record<string, unknown>[];

  // Priority 1: Labels
  const managedBy = labels['app.kubernetes.io/managed-by'];
  if (managedBy) {
    if (/helm/i.test(managedBy)) {
      const release = annotations['meta.helm.sh/release-name'];
      const ns = annotations['meta.helm.sh/release-namespace'];
      return {
        manager: 'Helm',
        detail: release ? `release: ${release}${ns ? ` (${ns})` : ''}` : undefined,
        willOverwrite: true,
        warning: 'This resource is managed by Helm. Your changes may be overwritten on the next helm upgrade.',
        color: 'blue',
      };
    }
    if (/argo/i.test(managedBy)) {
      const app = annotations['argocd.argoproj.io/managed-by'] || annotations['argocd.argoproj.io/tracking-id'];
      return {
        manager: 'ArgoCD',
        detail: app ? `app: ${app}` : undefined,
        willOverwrite: true,
        warning: 'This resource is managed by ArgoCD. Your changes may be overwritten during the next sync.',
        color: 'purple',
      };
    }
    // Generic operator or other tool
    return {
      manager: managedBy,
      detail: undefined,
      willOverwrite: true,
      warning: `This resource is managed by ${managedBy}. Your changes may be overwritten.`,
      color: 'teal',
    };
  }

  // Priority 2: Annotations
  if (annotations['argocd.argoproj.io/managed-by'] || annotations['argocd.argoproj.io/tracking-id']) {
    const app = annotations['argocd.argoproj.io/managed-by'] || annotations['argocd.argoproj.io/tracking-id'];
    return {
      manager: 'ArgoCD',
      detail: `app: ${app}`,
      willOverwrite: true,
      warning: 'This resource is managed by ArgoCD. Your changes may be overwritten during the next sync.',
      color: 'purple',
    };
  }
  if (annotations['meta.helm.sh/release-name']) {
    return {
      manager: 'Helm',
      detail: `release: ${annotations['meta.helm.sh/release-name']}`,
      willOverwrite: true,
      warning: 'This resource is managed by Helm. Your changes may be overwritten on the next helm upgrade.',
      color: 'blue',
    };
  }

  // Priority 3: Owner references (Operator-managed CRs)
  if (ownerRefs.length > 0) {
    const owner = ownerRefs[0];
    const ownerKind = String(owner['kind'] ?? '');
    const ownerName = String(owner['name'] ?? '');
    // If owned by an operator CR or CSV
    if (ownerKind === 'ClusterServiceVersion' || /operator/i.test(ownerKind)) {
      return {
        manager: 'Operator',
        detail: `${ownerKind}: ${ownerName}`,
        willOverwrite: true,
        warning: `This resource is managed by an Operator (${ownerName}). Your changes may be overwritten.`,
        color: 'teal',
      };
    }
    // Standard K8s ownership chain (RS→Deployment, etc.)
    return {
      manager: `Owned by ${ownerKind}`,
      detail: ownerName,
      willOverwrite: false,
      color: 'grey',
    };
  }

  // Priority 4: managedFields.manager
  const managers = managedFields
    .map((f) => f.manager ?? '')
    .filter((m) => m && m !== 'kube-apiserver' && m !== 'kube-controller-manager');
  const uniqueManagers = [...new Set(managers)];

  if (uniqueManagers.length > 0) {
    const primary = uniqueManagers[0];
    if (/helm/i.test(primary)) {
      return { manager: 'Helm', willOverwrite: true, warning: 'This resource is managed by Helm.', color: 'blue' };
    }
    if (/argocd/i.test(primary)) {
      return { manager: 'ArgoCD', willOverwrite: true, warning: 'This resource is managed by ArgoCD.', color: 'purple' };
    }
    if (/kubectl/i.test(primary)) {
      if (annotations['kubectl.kubernetes.io/last-applied-configuration']) {
        return { manager: 'kubectl apply', willOverwrite: false, color: 'orange' };
      }
      return { manager: 'kubectl', willOverwrite: false, color: 'orange' };
    }
    if (/mozilla|chrome|safari/i.test(primary)) {
      return { manager: 'Console (browser)', willOverwrite: false, color: 'green' };
    }
    return { manager: primary, willOverwrite: false, color: 'grey' };
  }

  // Fallback: check for kubectl last-applied-configuration
  if (annotations['kubectl.kubernetes.io/last-applied-configuration']) {
    return { manager: 'kubectl apply', willOverwrite: false, color: 'orange' };
  }

  return { manager: 'Unknown', willOverwrite: false, color: 'grey' };
}

/**
 * Get a short display string for list page columns.
 */
export function getManagerShort(resource: Record<string, unknown>): string {
  const info = detectOwnership(resource);
  return info.detail ? `${info.manager} (${info.detail})` : info.manager;
}
