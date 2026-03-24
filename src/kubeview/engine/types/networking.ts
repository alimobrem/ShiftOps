/**
 * Networking resource types.
 */

import type { ObjectMeta, Condition, LabelSelector } from './common';

export interface Ingress {
  apiVersion: 'networking.k8s.io/v1';
  kind: 'Ingress';
  metadata: ObjectMeta;
  spec?: {
    ingressClassName?: string;
    tls?: Array<{ hosts?: string[]; secretName?: string }>;
    rules?: Array<{
      host?: string;
      http?: { paths: Array<{ path?: string; pathType: string; backend: { service?: { name: string; port: { number?: number; name?: string } } } }> };
    }>;
    defaultBackend?: { service?: { name: string; port: { number?: number; name?: string } } };
  };
  status?: {
    loadBalancer?: { ingress?: Array<{ ip?: string; hostname?: string }> };
  };
}

export interface NetworkPolicy {
  apiVersion: 'networking.k8s.io/v1';
  kind: 'NetworkPolicy';
  metadata: ObjectMeta;
  spec?: {
    podSelector: LabelSelector;
    policyTypes?: Array<'Ingress' | 'Egress'>;
    ingress?: Array<{
      from?: Array<{ podSelector?: LabelSelector; namespaceSelector?: LabelSelector; ipBlock?: { cidr: string; except?: string[] } }>;
      ports?: Array<{ port?: number | string; protocol?: string }>;
    }>;
    egress?: Array<{
      to?: Array<{ podSelector?: LabelSelector; namespaceSelector?: LabelSelector; ipBlock?: { cidr: string; except?: string[] } }>;
      ports?: Array<{ port?: number | string; protocol?: string }>;
    }>;
  };
}

// OpenShift Route
export interface Route {
  apiVersion: 'route.openshift.io/v1';
  kind: 'Route';
  metadata: ObjectMeta;
  spec?: {
    host?: string;
    path?: string;
    to: { kind: string; name: string; weight?: number };
    port?: { targetPort: string | number };
    tls?: { termination?: 'edge' | 'passthrough' | 'reencrypt'; insecureEdgeTerminationPolicy?: 'Allow' | 'Redirect' | 'None'; certificate?: string; key?: string };
    wildcardPolicy?: string;
  };
  status?: {
    ingress?: Array<{ host?: string; conditions?: Condition[]; routerName?: string }>;
  };
}
