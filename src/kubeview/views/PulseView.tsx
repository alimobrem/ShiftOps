import React from 'react';
import { HeartPulse } from 'lucide-react';
import type { K8sResource } from '../engine/renderers';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';
import { useK8sListWatch } from '../hooks/useK8sListWatch';
import { ReportTab } from './pulse/ReportTab';

export default function PulseView() {
  const go = useNavigateTab();
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);

  const nsFilter = selectedNamespace !== '*' ? selectedNamespace : undefined;
  const { data: nodes = [] } = useK8sListWatch({ apiPath: '/api/v1/nodes' });
  const { data: pods = [] } = useK8sListWatch({ apiPath: '/api/v1/pods', namespace: nsFilter });
  const { data: deployments = [] } = useK8sListWatch({ apiPath: '/apis/apps/v1/deployments', namespace: nsFilter });
  const { data: pvcs = [] } = useK8sListWatch({ apiPath: '/api/v1/persistentvolumeclaims', namespace: nsFilter });
  const { data: operators = [] } = useK8sListWatch({ apiPath: '/apis/config.openshift.io/v1/clusteroperators' });

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-blue-500" />
            Cluster Pulse
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Daily briefing — control plane, capacity, workload health, and next steps
            {selectedNamespace !== '*' && <span className="text-blue-400 ml-1">· {selectedNamespace}</span>}
          </p>
        </div>

        <ReportTab
          nodes={nodes as K8sResource[]}
          allPods={pods as K8sResource[]}
          deployments={deployments as K8sResource[]}
          pvcs={pvcs as K8sResource[]}
          operators={operators as K8sResource[]}
          go={go}
        />
      </div>
    </div>
  );
}
