import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, User, Shield, Key, ArrowRight, CheckCircle, AlertCircle,
  UserCheck, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { k8sList } from '../engine/query';
import type { K8sResource } from '../engine/renderers';
import { useUIStore } from '../store/uiStore';
import { useNavigateTab } from '../hooks/useNavigateTab';

export default function UserManagementView() {
  const go = useNavigateTab();
  const addToast = useUIStore((s) => s.addToast);
  const impersonateUser = useUIStore((s) => s.impersonateUser);
  const setImpersonation = useUIStore((s) => s.setImpersonation);
  const clearImpersonation = useUIStore((s) => s.clearImpersonation);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'serviceaccounts'>('users');

  // Fetch users
  const { data: users = [] } = useQuery<K8sResource[]>({
    queryKey: ['users', 'list'],
    queryFn: () => k8sList('/apis/user.openshift.io/v1/users').catch(() => []),
    staleTime: 60000,
  });

  // Fetch groups
  const { data: groups = [] } = useQuery<K8sResource[]>({
    queryKey: ['groups', 'list'],
    queryFn: () => k8sList('/apis/user.openshift.io/v1/groups').catch(() => []),
    staleTime: 60000,
  });

  // Fetch service accounts (all namespaces)
  const { data: serviceAccounts = [] } = useQuery<K8sResource[]>({
    queryKey: ['serviceaccounts', 'list'],
    queryFn: () => k8sList('/api/v1/serviceaccounts').catch(() => []),
    staleTime: 60000,
  });

  // Fetch cluster role bindings for role info
  const { data: clusterRoleBindings = [] } = useQuery<K8sResource[]>({
    queryKey: ['clusterrolebindings', 'list'],
    queryFn: () => k8sList('/apis/rbac.authorization.k8s.io/v1/clusterrolebindings').catch(() => []),
    staleTime: 120000,
  });

  // Build user → roles map
  const userRoles = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const crb of clusterRoleBindings as any[]) {
      const roleName = crb.roleRef?.name || '';
      for (const subject of crb.subjects || []) {
        if (subject.kind === 'User' || subject.kind === 'ServiceAccount') {
          const key = subject.kind === 'ServiceAccount'
            ? `system:serviceaccount:${subject.namespace}:${subject.name}`
            : subject.name;
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(roleName);
        }
        if (subject.kind === 'Group') {
          if (!map.has(`group:${subject.name}`)) map.set(`group:${subject.name}`, []);
          map.get(`group:${subject.name}`)!.push(roleName);
        }
      }
    }
    return map;
  }, [clusterRoleBindings]);

  const handleImpersonate = (username: string) => {
    setImpersonation(username);
    addToast({ type: 'warning', title: `Impersonating ${username}`, detail: 'All API requests now use this identity' });
  };

  // Filter
  const q = search.toLowerCase();
  const filteredUsers = users.filter((u: any) => !q || u.metadata.name.toLowerCase().includes(q));
  const filteredGroups = groups.filter((g: any) => !q || g.metadata.name.toLowerCase().includes(q));
  const filteredSAs = serviceAccounts.filter((sa: any) => {
    if (!q) return true;
    return sa.metadata.name.toLowerCase().includes(q) || sa.metadata.namespace?.toLowerCase().includes(q);
  });

  // Exclude system SAs for cleaner view
  const appSAs = filteredSAs.filter((sa: any) => {
    const ns = sa.metadata.namespace || '';
    return !ns.startsWith('openshift-') && !ns.startsWith('kube-') && ns !== 'openshift' && sa.metadata.name !== 'default';
  });

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" /> User Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">Users, groups, service accounts, and impersonation</p>
        </div>

        {/* Impersonation banner */}
        {impersonateUser && (
          <div className="flex items-center justify-between px-4 py-3 bg-amber-900/30 border border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-amber-200">Currently impersonating <span className="font-mono font-bold">{impersonateUser}</span></span>
            </div>
            <button onClick={() => { clearImpersonation(); addToast({ type: 'success', title: 'Impersonation cleared' }); }}
              className="px-3 py-1.5 text-xs bg-amber-800 hover:bg-amber-700 text-amber-200 rounded transition-colors">
              Stop Impersonating
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => setActiveTab('users')} className="bg-slate-900 rounded-lg border border-slate-800 p-3 text-left hover:border-slate-600 transition-colors">
            <div className="text-xs text-slate-400 mb-1">Users</div>
            <div className="text-xl font-bold text-slate-100">{users.length}</div>
          </button>
          <button onClick={() => setActiveTab('groups')} className="bg-slate-900 rounded-lg border border-slate-800 p-3 text-left hover:border-slate-600 transition-colors">
            <div className="text-xs text-slate-400 mb-1">Groups</div>
            <div className="text-xl font-bold text-slate-100">{groups.length}</div>
          </button>
          <button onClick={() => setActiveTab('serviceaccounts')} className="bg-slate-900 rounded-lg border border-slate-800 p-3 text-left hover:border-slate-600 transition-colors">
            <div className="text-xs text-slate-400 mb-1">Service Accounts</div>
            <div className="text-xl font-bold text-slate-100">{serviceAccounts.length}</div>
          </button>
          <button onClick={() => go('/r/rbac.authorization.k8s.io~v1~clusterrolebindings', 'ClusterRoleBindings')} className="bg-slate-900 rounded-lg border border-slate-800 p-3 text-left hover:border-slate-600 transition-colors">
            <div className="text-xs text-slate-400 mb-1">Cluster Role Bindings</div>
            <div className="text-xl font-bold text-slate-100">{clusterRoleBindings.length}</div>
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            {([
              { id: 'users' as const, label: `Users (${users.length})` },
              { id: 'groups' as const, label: `Groups (${groups.length})` },
              { id: 'serviceaccounts' as const, label: `Service Accounts` },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('px-3 py-1.5 text-xs rounded-md transition-colors', activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-100">Users</h2>
            </div>
            <div className="divide-y divide-slate-800 max-h-[500px] overflow-auto">
              {filteredUsers.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No users found</div>
              ) : filteredUsers.map((user: any) => {
                const roles = userRoles.get(user.metadata.name) || [];
                const isAdmin = roles.some(r => r === 'cluster-admin');
                const identities = user.identities || [];
                return (
                  <div key={user.metadata.uid} className="px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{user.metadata.name}</span>
                          {isAdmin && <span className="text-[10px] px-1.5 py-0.5 bg-red-900/50 text-red-300 rounded">cluster-admin</span>}
                          {user.metadata.name === 'kube:admin' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded">built-in</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {identities.length > 0 && <span className="text-xs text-slate-500">{identities[0]}</span>}
                          {roles.length > 0 && roles.length <= 3 && roles.map(r => (
                            <span key={r} className="text-[10px] px-1 py-0.5 bg-slate-800 text-slate-500 rounded">{r}</span>
                          ))}
                          {roles.length > 3 && <span className="text-[10px] text-slate-600">+{roles.length} roles</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleImpersonate(user.metadata.name)}
                      disabled={impersonateUser === user.metadata.name}
                      className={cn('px-2.5 py-1.5 text-xs rounded flex items-center gap-1.5 transition-colors',
                        impersonateUser === user.metadata.name
                          ? 'bg-amber-900/50 text-amber-300'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {impersonateUser === user.metadata.name ? 'Impersonating' : 'Impersonate'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Groups tab */}
        {activeTab === 'groups' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-100">Groups</h2>
            </div>
            <div className="divide-y divide-slate-800 max-h-[500px] overflow-auto">
              {filteredGroups.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No groups found</div>
              ) : filteredGroups.map((group: any) => {
                const members = group.users || [];
                const roles = userRoles.get(`group:${group.metadata.name}`) || [];
                return (
                  <div key={group.metadata.uid} className="px-4 py-3 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-medium text-slate-200">{group.metadata.name}</span>
                        <span className="text-xs text-slate-500">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                      </div>
                      {roles.length > 0 && (
                        <div className="flex gap-1">
                          {roles.slice(0, 3).map(r => (
                            <span key={r} className="text-[10px] px-1.5 py-0.5 bg-indigo-900/50 text-indigo-300 rounded">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {members.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-6">
                        {members.slice(0, 10).map((m: string) => (
                          <span key={m} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{m}</span>
                        ))}
                        {members.length > 10 && <span className="text-[10px] text-slate-600">+{members.length - 10} more</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Service Accounts tab */}
        {activeTab === 'serviceaccounts' && (
          <div className="bg-slate-900 rounded-lg border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Service Accounts (application namespaces)</h2>
              <button onClick={() => go('/r/v1~serviceaccounts', 'ServiceAccounts')} className="text-xs text-blue-400 hover:text-blue-300">View all →</button>
            </div>
            <div className="divide-y divide-slate-800 max-h-[500px] overflow-auto">
              {appSAs.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">No application service accounts found</div>
              ) : appSAs.slice(0, 50).map((sa: any) => {
                const saName = `system:serviceaccount:${sa.metadata.namespace}:${sa.metadata.name}`;
                const roles = userRoles.get(saName) || [];
                return (
                  <div key={sa.metadata.uid} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <Key className="w-4 h-4 text-slate-500" />
                      <div>
                        <span className="text-sm text-slate-200">{sa.metadata.name}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded ml-2">{sa.metadata.namespace}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {roles.length > 0 && (
                        <span className="text-[10px] text-slate-500">{roles.length} role{roles.length !== 1 ? 's' : ''}</span>
                      )}
                      <button
                        onClick={() => handleImpersonate(saName)}
                        className="px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Related Resources</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'ClusterRoles', path: '/r/rbac.authorization.k8s.io~v1~clusterroles' },
              { label: 'ClusterRoleBindings', path: '/r/rbac.authorization.k8s.io~v1~clusterrolebindings' },
              { label: 'Roles', path: '/r/rbac.authorization.k8s.io~v1~roles' },
              { label: 'RoleBindings', path: '/r/rbac.authorization.k8s.io~v1~rolebindings' },
            ].map((item) => (
              <button key={item.label} onClick={() => go(item.path, item.label)}
                className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-800/50 text-left transition-colors">
                <span className="text-sm text-slate-300">{item.label}</span>
                <ArrowRight className="w-3 h-3 text-slate-600" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
