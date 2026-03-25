import { Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';

const AccessControlView = lazy(() => import('../views/AccessControlView'));
const UserManagementView = lazy(() => import('../views/UserManagementView'));
const StorageView = lazy(() => import('../views/StorageView'));
const AdminView = lazy(() => import('../views/AdminView'));
const AlertsView = lazy(() => import('../views/AlertsView'));
const WorkloadsView = lazy(() => import('../views/WorkloadsView'));
const NetworkingView = lazy(() => import('../views/NetworkingView'));
const ComputeView = lazy(() => import('../views/ComputeView'));
const BuildsView = lazy(() => import('../views/BuildsView'));
const CRDsView = lazy(() => import('../views/CRDsView'));
const SecurityView = lazy(() => import('../views/SecurityView'));
const ArgoCDView = lazy(() => import('../views/ArgoCDView'));
const FleetView = lazy(() => import('../views/FleetView'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="kv-skeleton w-8 h-8 rounded-full" />
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>;
}

export function domainRoutes() {
  return (
    <>
      <Route path="workloads" element={<Lazy><WorkloadsView /></Lazy>} />
      <Route path="networking" element={<Lazy><NetworkingView /></Lazy>} />
      <Route path="compute" element={<Lazy><ComputeView /></Lazy>} />
      <Route path="storage" element={<Lazy><StorageView /></Lazy>} />
      <Route path="builds" element={<Lazy><BuildsView /></Lazy>} />
      <Route path="crds" element={<Lazy><CRDsView /></Lazy>} />
      <Route path="security" element={<Lazy><SecurityView /></Lazy>} />
      <Route path="access-control" element={<Lazy><AccessControlView /></Lazy>} />
      <Route path="users" element={<Lazy><UserManagementView /></Lazy>} />
      <Route path="admin" element={<Lazy><AdminView /></Lazy>} />
      <Route path="alerts" element={<Lazy><AlertsView /></Lazy>} />
      <Route path="gitops" element={<Lazy><ArgoCDView /></Lazy>} />
      <Route path="fleet" element={<Lazy><FleetView /></Lazy>} />
    </>
  );
}
