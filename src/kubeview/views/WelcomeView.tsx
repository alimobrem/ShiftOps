import {
  HeartPulse, Search, ArrowRight, Zap, Shield, Bell, Settings,
  HardDrive, Package, Globe, Server, Puzzle, Users, Hammer,
  Keyboard, Eye,
} from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';

export default function WelcomeView() {
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const go = useNavigateTab();

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto space-y-8 py-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100 mb-3">
            Welcome to <span className="text-blue-400">ShiftOps</span>
          </h1>
          <p className="text-base text-slate-400 max-w-2xl mx-auto">
            A console for managing your OpenShift cluster. Browse resources,
            diagnose issues, deploy software, and audit security.
          </p>
        </div>

        {/* Quick Start */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Start
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickAction
              icon={<HeartPulse className="w-6 h-6 text-blue-400" />}
              title="Cluster Pulse"
              description="Risk score, attention items, live issues, and certificate expiry"
              onClick={() => go('/pulse', 'Pulse')}
            />
            <QuickAction
              icon={<Search className="w-6 h-6 text-emerald-400" />}
              title="Find Resources"
              description="Press ⌘K to search any resource type"
              onClick={openCommandPalette}
            />
            <QuickAction
              icon={<Shield className="w-6 h-6 text-orange-400" />}
              title="Production Readiness"
              description="Automated health checks for cluster, workloads, storage, and networking"
              onClick={() => go('/admin?tab=readiness', 'Admin')}
            />
          </div>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-purple-400" />
            Keyboard Shortcuts
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Shortcut keys="⌘ K" label="Command Palette" description="Search resources, views, and actions" />
            <Shortcut keys="⌘ B" label="Resource Browser" description="Browse all API groups and resources" />
            <Shortcut keys="j / k" label="Navigate Table" description="Move up/down in resource lists" />
          </div>
        </div>

        {/* Views */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            Views
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <PageLink icon={<HeartPulse className="w-5 h-5 text-blue-400" />} title="Cluster Pulse" description="Risk report, live issues, runbooks, cert expiry" onClick={() => go('/pulse', 'Pulse')} />
            <PageLink icon={<Bell className="w-5 h-5 text-red-400" />} title="Alerts" description="Firing alerts, silences, severity filters" onClick={() => go('/alerts', 'Alerts')} />
            <PageLink icon={<Package className="w-5 h-5 text-blue-400" />} title="Software" description="Operators, Helm charts, Quick Deploy, templates" onClick={() => go('/software', 'Software')} />
            <PageLink icon={<Package className="w-5 h-5 text-blue-400" />} title="Workloads" description="Deployments, pods, health audit" onClick={() => go('/workloads', 'Workloads')} />
            <PageLink icon={<Globe className="w-5 h-5 text-cyan-400" />} title="Networking" description="Routes, services, ingress, network policies" onClick={() => go('/networking', 'Networking')} />
            <PageLink icon={<Server className="w-5 h-5 text-blue-400" />} title="Compute" description="Nodes, machines, autoscaling" onClick={() => go('/compute', 'Compute')} />
            <PageLink icon={<HardDrive className="w-5 h-5 text-orange-400" />} title="Storage" description="PVCs, StorageClasses, CSI drivers, snapshots" onClick={() => go('/storage', 'Storage')} />
            <PageLink icon={<Hammer className="w-5 h-5 text-orange-500" />} title="Builds" description="BuildConfigs, Builds, ImageStreams" onClick={() => go('/builds', 'Builds')} />
            <PageLink icon={<Shield className="w-5 h-5 text-indigo-400" />} title="Access Control" description="RBAC audit, cluster-admin tracking" onClick={() => go('/access-control', 'Access Control')} />
            <PageLink icon={<Users className="w-5 h-5 text-teal-400" />} title="User Management" description="Users, groups, impersonation" onClick={() => go('/users', 'Users')} />
            <PageLink icon={<Puzzle className="w-5 h-5 text-violet-400" />} title="CRDs" description="Custom resources by API group" onClick={() => go('/crds', 'CRDs')} />
            <PageLink icon={<Settings className="w-5 h-5 text-slate-400" />} title="Administration" description="Config, updates, snapshots, certificates, quotas" onClick={() => go('/admin', 'Administration')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, title, description, onClick }: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 p-4 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 transition-colors text-center"
    >
      {icon}
      <div>
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <div className="text-xs text-slate-400 mt-1">{description}</div>
      </div>
    </button>
  );
}

function Shortcut({ keys, label, description }: { keys: string; label: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
      <kbd className="px-2 py-1 bg-slate-700 rounded text-xs font-mono text-slate-200 whitespace-nowrap shrink-0">{keys}</kbd>
      <div>
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
    </div>
  );
}

function PageLink({ icon, title, description, onClick }: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors text-left w-full"
    >
      {icon}
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-200">{title}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-600" />
    </button>
  );
}
