import { Route, Navigate, useParams } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import TableView from '../views/TableView';
import DetailView from '../views/DetailView';
import { LoadingFallback } from '../components/LoadingFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';

const YamlEditorView = lazy(() => import('../views/YamlEditorView'));
const LogsView = lazy(() => import('../views/LogsView'));
const MetricsView = lazy(() => import('../views/MetricsView'));
const CreateView = lazy(() => import('../views/CreateView'));
const DependencyView = lazy(() => import('../views/DependencyView'));
const NodeLogsView = lazy(() => import('../views/NodeLogsView'));

function parseGvr(gvr: string) {
  return gvr.replace(/~/g, '/');
}

function ResourceListRoute() {
  const { gvr } = useParams<{ gvr: string }>();
  if (!gvr) return <Navigate to="/pulse" replace />;
  return <TableView gvrKey={parseGvr(gvr)} />;
}

function ResourceDetailRoute() {
  const { gvr, namespace, name } = useParams<{ gvr: string; namespace?: string; name: string }>();
  if (!gvr || !name) return <Navigate to="/pulse" replace />;
  return <DetailView gvrKey={parseGvr(gvr)} namespace={namespace} name={name} />;
}

function YamlRoute() {
  const { gvr, namespace, name } = useParams<{ gvr: string; namespace?: string; name: string }>();
  if (!gvr || !name) return <Navigate to="/pulse" replace />;
  return (
    <ErrorBoundary fallbackTitle="YAML Editor">
      <Suspense fallback={<LoadingFallback />}>
        <YamlEditorView gvrKey={parseGvr(gvr)} namespace={namespace} name={name} />
      </Suspense>
    </ErrorBoundary>
  );
}

function LogsRoute() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  if (!namespace || !name) return <Navigate to="/pulse" replace />;
  return (
    <ErrorBoundary fallbackTitle="Logs">
      <Suspense fallback={<LoadingFallback />}>
        <LogsView namespace={namespace} podName={name} />
      </Suspense>
    </ErrorBoundary>
  );
}

function MetricsRoute() {
  const { gvr, namespace, name } = useParams<{ gvr: string; namespace?: string; name: string }>();
  if (!gvr || !name) return <Navigate to="/pulse" replace />;
  return (
    <ErrorBoundary fallbackTitle="Metrics">
      <Suspense fallback={<LoadingFallback />}>
        <MetricsView gvrKey={parseGvr(gvr)} namespace={namespace} name={name} />
      </Suspense>
    </ErrorBoundary>
  );
}

function CreateRoute() {
  const { gvr } = useParams<{ gvr: string }>();
  if (!gvr) return <Navigate to="/pulse" replace />;
  return (
    <ErrorBoundary fallbackTitle="Create Resource">
      <Suspense fallback={<LoadingFallback />}>
        <CreateView gvrKey={parseGvr(gvr)} />
      </Suspense>
    </ErrorBoundary>
  );
}

function DependencyRoute() {
  const { gvr, namespace, name } = useParams<{ gvr: string; namespace?: string; name: string }>();
  if (!gvr || !name) return <Navigate to="/pulse" replace />;
  return (
    <ErrorBoundary fallbackTitle="Dependencies">
      <Suspense fallback={<LoadingFallback />}>
        <DependencyView gvrKey={parseGvr(gvr)} namespace={namespace} name={name} />
      </Suspense>
    </ErrorBoundary>
  );
}

export function resourceRoutes() {
  return (
    <>
      {/* Resource list: /r/apps~v1~deployments */}
      <Route path="r/:gvr" element={<ResourceListRoute />} />

      {/* Resource detail: /r/apps~v1~deployments/:namespace/:name */}
      <Route path="r/:gvr/:namespace/:name" element={<ResourceDetailRoute />} />

      {/* Cluster-scoped detail: /r/v1~nodes/_/:name */}
      <Route path="r/:gvr/_/:name" element={<ResourceDetailRoute />} />

      {/* YAML editor: /yaml/apps~v1~deployments/:namespace/:name */}
      <Route path="yaml/:gvr/:namespace/:name" element={<YamlRoute />} />
      <Route path="yaml/:gvr/_/:name" element={<YamlRoute />} />

      {/* Logs: /logs/:namespace/:podName */}
      <Route path="logs/:namespace/:name" element={<LogsRoute />} />

      {/* Node logs: /node-logs/:name */}
      <Route path="node-logs/:name" element={
        <ErrorBoundary fallbackTitle="Node Logs">
          <Suspense fallback={<LoadingFallback />}>
            <NodeLogsView />
          </Suspense>
        </ErrorBoundary>
      } />

      {/* Metrics: /metrics/apps~v1~deployments/:namespace/:name */}
      <Route path="metrics/:gvr/:namespace/:name" element={<MetricsRoute />} />
      <Route path="metrics/:gvr/_/:name" element={<MetricsRoute />} />

      {/* Create: /create/apps~v1~deployments */}
      <Route path="create/:gvr" element={<CreateRoute />} />

      {/* Dependencies: /deps/apps~v1~deployments/:namespace/:name */}
      <Route path="deps/:gvr/:namespace/:name" element={<DependencyRoute />} />
    </>
  );
}
