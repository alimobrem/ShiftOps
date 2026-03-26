import React from 'react';
import { HeartPulse } from 'lucide-react';
import type { K8sResource } from '../engine/renderers';
import { useUIStore } from '../store/uiStore';
import { useFleetStore } from '../store/fleetStore';
import { useNavigateTab } from '../hooks/useNavigateTab';
import { useK8sListWatch } from '../hooks/useK8sListWatch';
import { LastUpdated, earliestDataUpdatedAt } from '../components/primitives/LastUpdated';
import { ReportTab } from './pulse/ReportTab';
import { FleetReportTab } from './pulse/FleetReportTab';
import { AIOnboarding } from '../components/agent/AIOnboarding';

export default function PulseView() {
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const fleetMode = useFleetStore((s) => s.fleetMode);

  const nsFilter = selectedNamespace !== '*' ? selectedNamespace : undefined;
  const nodesQuery = useK8sListWatch({ apiPath: '/api/v1/nodes' });
  const podsQuery = useK8sListWatch({ apiPath: '/api/v1/pods', namespace: nsFilter });
  const deploysQuery = useK8sListWatch({ apiPath: '/apis/apps/v1/deployments', namespace: nsFilter });
  const pvcsQuery = useK8sListWatch({ apiPath: '/api/v1/persistentvolumeclaims', namespace: nsFilter });
  const operatorsQuery = useK8sListWatch({ apiPath: '/apis/config.openshift.io/v1/clusteroperators' });

  const nodes = nodesQuery.data ?? [];
  const pods = podsQuery.data ?? [];
  const deployments = deploysQuery.data ?? [];
  const pvcs = pvcsQuery.data ?? [];
  const operators = operatorsQuery.data ?? [];
  const nodesLoading = nodesQuery.isLoading;
  const podsLoading = podsQuery.isLoading;
  const deploysLoading = deploysQuery.isLoading;

  const dataUpdatedAt = earliestDataUpdatedAt([nodesQuery, podsQuery, deploysQuery, pvcsQuery, operatorsQuery]);

  const isLoading = nodesLoading || podsLoading || deploysLoading;

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-blue-500" />
            Cluster Pulse
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-slate-400">
              Daily briefing — control plane, capacity, workload health, and next steps
              {selectedNamespace !== '*' && <span className="text-blue-400 ml-1">· {selectedNamespace}</span>}
            </p>
            <LastUpdated timestamp={dataUpdatedAt} />
          </div>
        </div>

        <AIOnboarding compact className="mb-2" />

        {fleetMode === 'multi' ? (
          <FleetReportTab />
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-slate-900 rounded-lg border border-slate-800 p-6 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
                <div className="h-3 bg-slate-800 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
        <ReportTab
          nodes={nodes as K8sResource[]}
          allPods={pods as K8sResource[]}
          deployments={deployments as K8sResource[]}
          pvcs={pvcs as K8sResource[]}
          operators={operators as K8sResource[]}
          go={go}
        />
        )}
      </div>
    </div>
  );
}
