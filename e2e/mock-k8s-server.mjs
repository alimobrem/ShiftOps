/**
 * Lightweight mock K8s API server for integration tests.
 * Returns static JSON responses for common K8s API paths.
 */

import { createServer } from 'http';

const NODES = {
  kind: 'NodeList', apiVersion: 'v1',
  items: [
    { apiVersion: 'v1', kind: 'Node', metadata: { name: 'worker-1', uid: 'n1', creationTimestamp: '2026-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/worker': '' } }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4', memory: '16Gi' } } },
    { apiVersion: 'v1', kind: 'Node', metadata: { name: 'worker-2', uid: 'n2', creationTimestamp: '2026-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/worker': '' } }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4', memory: '16Gi' } } },
    { apiVersion: 'v1', kind: 'Node', metadata: { name: 'master-1', uid: 'n3', creationTimestamp: '2026-01-01T00:00:00Z', labels: { 'node-role.kubernetes.io/master': '' } }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '8', memory: '32Gi' } } },
  ],
};

const PODS = {
  kind: 'PodList', apiVersion: 'v1',
  items: [
    { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'nginx-abc12', namespace: 'default', uid: 'p1', creationTimestamp: '2026-03-01T10:00:00Z', labels: { app: 'nginx' } }, spec: { containers: [{ name: 'nginx', image: 'nginx:1.25' }] }, status: { phase: 'Running', containerStatuses: [{ name: 'nginx', ready: true, restartCount: 0, state: { running: {} } }] } },
    { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'api-xyz99', namespace: 'backend', uid: 'p2', creationTimestamp: '2026-03-01T10:00:00Z', labels: { app: 'api' } }, spec: { containers: [{ name: 'api', image: 'api:latest' }] }, status: { phase: 'Running', containerStatuses: [{ name: 'api', ready: true, restartCount: 0, state: { running: {} } }] } },
  ],
};

const DEPLOYMENTS = {
  kind: 'DeploymentList', apiVersion: 'apps/v1',
  items: [
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'nginx', namespace: 'default', uid: 'd1', creationTimestamp: '2026-01-15T00:00:00Z' }, spec: { replicas: 2, selector: { matchLabels: { app: 'nginx' } } }, status: { replicas: 2, readyReplicas: 2, availableReplicas: 2, conditions: [{ type: 'Available', status: 'True' }] } },
  ],
};

const NAMESPACES = {
  kind: 'NamespaceList', apiVersion: 'v1',
  items: [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'default', uid: 'ns1' }, status: { phase: 'Active' } },
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'backend', uid: 'ns2' }, status: { phase: 'Active' } },
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kube-system', uid: 'ns3' }, status: { phase: 'Active' } },
  ],
};

const CLUSTER_VERSION = {
  apiVersion: 'config.openshift.io/v1', kind: 'ClusterVersion',
  metadata: { name: 'version' },
  spec: { channel: 'stable-4.16' },
  status: { desired: { version: '4.16.5' }, history: [{ state: 'Completed', version: '4.16.5' }], conditions: [{ type: 'Available', status: 'True' }] },
};

const INFRASTRUCTURE = {
  apiVersion: 'config.openshift.io/v1', kind: 'Infrastructure',
  metadata: { name: 'cluster' },
  status: { controlPlaneTopology: 'HighlyAvailable', platform: 'AWS', infrastructureName: 'pulse-test' },
};

const EMPTY_LIST = { kind: 'List', apiVersion: 'v1', items: [] };

const ROUTES = {
  '/api/v1/nodes': NODES,
  '/api/v1/pods': PODS,
  '/api/v1/namespaces': NAMESPACES,
  '/api/v1/events': EMPTY_LIST,
  '/api/v1/services': EMPTY_LIST,
  '/api/v1/persistentvolumeclaims': EMPTY_LIST,
  '/api/v1/resourcequotas': EMPTY_LIST,
  '/api/v1/secrets': EMPTY_LIST,
  '/api/v1/configmaps': EMPTY_LIST,
  '/apis/apps/v1/deployments': DEPLOYMENTS,
  '/apis/apps/v1/statefulsets': EMPTY_LIST,
  '/apis/apps/v1/daemonsets': EMPTY_LIST,
  '/apis/batch/v1/jobs': EMPTY_LIST,
  '/apis/batch/v1/cronjobs': EMPTY_LIST,
  '/apis/networking.k8s.io/v1/networkpolicies': EMPTY_LIST,
  '/apis/networking.k8s.io/v1/ingresses': EMPTY_LIST,
  '/apis/storage.k8s.io/v1/storageclasses': EMPTY_LIST,
  '/apis/rbac.authorization.k8s.io/v1/clusterroles': EMPTY_LIST,
  '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings': EMPTY_LIST,
  '/apis/rbac.authorization.k8s.io/v1/roles': EMPTY_LIST,
  '/apis/rbac.authorization.k8s.io/v1/rolebindings': EMPTY_LIST,
  '/apis/config.openshift.io/v1/clusterversions/version': CLUSTER_VERSION,
  '/apis/config.openshift.io/v1/infrastructures/cluster': INFRASTRUCTURE,
  '/apis/config.openshift.io/v1/clusteroperators': EMPTY_LIST,
  '/apis/route.openshift.io/v1/routes': EMPTY_LIST,
  '/apis/build.openshift.io/v1/builds': EMPTY_LIST,
  '/apis/build.openshift.io/v1/buildconfigs': EMPTY_LIST,
  '/apis/image.openshift.io/v1/imagestreams': EMPTY_LIST,
  '/apis/machine.openshift.io/v1beta1/machines': EMPTY_LIST,
  '/apis/machine.openshift.io/v1beta1/machinesets': EMPTY_LIST,
};

// API discovery endpoints
const API_GROUPS = {
  kind: 'APIGroupList', apiVersion: 'v1',
  groups: [
    { name: 'apps', versions: [{ groupVersion: 'apps/v1', version: 'v1' }], preferredVersion: { groupVersion: 'apps/v1', version: 'v1' } },
    { name: 'batch', versions: [{ groupVersion: 'batch/v1', version: 'v1' }], preferredVersion: { groupVersion: 'batch/v1', version: 'v1' } },
  ],
};

// Pre-compiled regex for namespace-scoped path matching
const NS_PATH_RE = /^(\/api[s]?\/[^/]+(?:\/[^/]+)?)\/namespaces\/[^/]+\/(.+)$/;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Strip query params for route matching, but allow fieldSelector etc.
  const routePath = path.replace(/\/$/, '') || '/';

  // Handle namespace-scoped list paths by stripping namespace
  let response = ROUTES[routePath];

  if (!response) {
    // Try matching namespace-scoped paths: /api/v1/namespaces/{ns}/pods
    const nsMatch = routePath.match(NS_PATH_RE);
    if (nsMatch) {
      const basePath = `${nsMatch[1]}/${nsMatch[2]}`;
      response = ROUTES[basePath];
    }
  }

  if (!response && routePath === '/apis') {
    response = API_GROUPS;
  }

  if (!response && routePath === '/api/v1') {
    response = { kind: 'APIResourceList', groupVersion: 'v1', resources: [] };
  }

  if (response) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(response));
  } else {
    // Return empty list for unknown paths (graceful degradation)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(EMPTY_LIST));
  }
});

const PORT = parseInt(process.env.PORT || '8001', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock K8s API server listening on :${PORT}`);
  console.log(`Serving ${Object.keys(ROUTES).length} API routes`);
});
