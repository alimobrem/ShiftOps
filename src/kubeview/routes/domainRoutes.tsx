import { Route, useParams } from 'react-router-dom';
import React, { Suspense, lazy } from 'react';

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
const CompareView = lazy(() => import('../views/fleet/CompareView'));
const ComplianceView = lazy(() => import('../views/fleet/ComplianceView'));
const FleetResourceView = lazy(() => import('../views/fleet/FleetResourceView'));
const FleetWorkloadsView = lazy(() => import('../views/fleet/FleetWorkloadsView'));
const FleetAlertsView = lazy(() => import('../views/fleet/FleetAlertsView'));
const DriftDetectorView = lazy(() => import('../views/fleet/DriftDetectorView').then(m => ({ default: m.DriftDetectorView })));
const MonitorView = lazy(() => import('../views/MonitorView'));
const DynamicView = lazy(() => import('../views/DynamicView').then(m => ({ default: m.DynamicView })));

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

function FleetResourceRoute() {
  const { gvr } = useParams<{ gvr: string }>();
  const gvrKey = (gvr || '').replace(/~/g, '/');
  return <FleetResourceView gvrKey={gvrKey} />;
}

function DynamicViewRoute() {
  const { id } = useParams<{ id: string }>();
  return <DynamicView viewId={id} />;
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
      <Route path="fleet/compare" element={<Lazy><CompareView /></Lazy>} />
      <Route path="fleet/compliance" element={<Lazy><ComplianceView /></Lazy>} />
      <Route path="fleet/workloads" element={<Lazy><FleetWorkloadsView /></Lazy>} />
      <Route path="fleet/alerts" element={<Lazy><FleetAlertsView /></Lazy>} />
      <Route path="fleet/r/:gvr" element={<Lazy><FleetResourceRoute /></Lazy>} />
      <Route path="fleet/drift" element={<Lazy><DriftDetectorView /></Lazy>} />
      <Route path="monitor" element={<Lazy><MonitorView /></Lazy>} />
      <Route path="dynamic/:id" element={<Lazy><DynamicViewRoute /></Lazy>} />
    </>
  );
}
