import { Activity } from 'lucide-react';
import { SLOTab } from './toolbox/SLOTab';

export default function SloView() {
  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-400" />
            Service Level Objectives
          </h1>
          <p className="text-sm text-slate-400 mt-1">Define and track service health targets with live burn rate monitoring</p>
        </div>
        <SLOTab />
      </div>
    </div>
  );
}
