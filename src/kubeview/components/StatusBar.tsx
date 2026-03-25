import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useFleetStore } from '../store/fleetStore';
import { isMultiCluster } from '../engine/clusterConnection';
import { cn } from '@/lib/utils';

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function StatusBar() {
  const connectionStatus = useUIStore((s) => s.connectionStatus);
  const lastSyncTime = useUIStore((s) => s.lastSyncTime);
  const selectedNamespace = useUIStore((s) => s.selectedNamespace);
  const activeOperation = useUIStore((s) => s.activeOperation);
  const tabs = useUIStore((s) => s.tabs);
  const location = useLocation();
  const activeCluster = useFleetStore((s) => s.clusters.find(c => c.id === s.activeClusterId));

  const [relativeTime, setRelativeTime] = useState(formatRelativeTime(lastSyncTime));

  useEffect(() => {
    const interval = setInterval(() => setRelativeTime(formatRelativeTime(lastSyncTime)), 1000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // Derive current page info from URL
  const pageInfo = (() => {
    const path = location.pathname;
    if (path === '/welcome') return 'Welcome';
    if (path === '/pulse') return 'Cluster Pulse';
    if (path === '/workloads') return 'Workloads';
    if (path === '/networking') return 'Networking';
    if (path === '/storage') return 'Storage';
    if (path === '/builds') return 'Builds';
    if (path === '/crds') return 'Custom Resources';
    if (path === '/access-control') return 'Access Control';
    if (path === '/users') return 'User Management';
    if (path === '/admin') return 'Administration';
    if (path === '/alerts') return 'Alerts';
    if (path.startsWith('/r/')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 2) {
        const gvr = parts[1].split('~');
        return gvr[gvr.length - 1];
      }
      if (parts.length >= 4) return `${parts[parts.length - 1]}`;
    }
    if (path.startsWith('/create/')) return 'Software';
    if (path.startsWith('/yaml/')) return 'YAML Editor';
    if (path.startsWith('/logs/')) return 'Logs';
    if (path.startsWith('/metrics/')) return 'Metrics';
    if (path.startsWith('/deps/')) return 'Dependencies';
    return '';
  })();

  const openTabCount = tabs.filter((t) => t.closable).length;

  return (
    <div className="flex h-6 items-center justify-between border-t border-slate-700 bg-slate-800 px-4 text-xs text-slate-500">
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={cn('h-1.5 w-1.5 rounded-full', connectionStatus === 'connected' ? 'bg-emerald-500' : connectionStatus === 'reconnecting' ? 'bg-yellow-500' : 'bg-red-500')} />
          <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus}</span>
        </div>
        <span>synced {relativeTime} ago</span>
        {activeOperation && <span className="text-emerald-400">{activeOperation}</span>}
        {isMultiCluster() && activeCluster && <span className="text-blue-400">· {activeCluster.name}</span>}
        {pageInfo && <span className="text-slate-400">· {pageInfo}</span>}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {openTabCount > 0 && <span>{openTabCount} tab{openTabCount !== 1 ? 's' : ''}</span>}
        <span>{selectedNamespace === '*' ? 'all namespaces' : selectedNamespace}</span>
        <span>{isMultiCluster() ? '⌘K search · ⌘B browse · ⌘⇧C switch cluster' : '⌘K search · ⌘B browse'}</span>
      </div>
    </div>
  );
}
