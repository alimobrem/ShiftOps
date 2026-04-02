/** Returns true for OpenShift/K8s system namespaces that should be excluded from user-facing views. */
export function isSystemNamespace(ns: string | undefined): boolean {
  if (!ns) return true;
  return (
    ns.startsWith('openshift-') ||
    ns.startsWith('kube-') ||
    ns === 'openshift' ||
    ns === 'default'
  );
}
