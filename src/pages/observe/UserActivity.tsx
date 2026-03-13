import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageSection, Title, Card, CardBody, Label, Button,
  ToggleGroup, ToggleGroupItem, SearchInput,
  Toolbar, ToolbarContent, ToolbarItem, Pagination,
  Tabs, Tab, TabTitleText,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useClusterStore } from '@/store/useClusterStore';

const BASE = '/api/kubernetes';

interface ActivityEntry {
  id: string;
  manager: string;
  user: string;
  kind: string;
  name: string;
  namespace: string;
  operation: string;
  timestamp: Date;
  fields?: string[];
  href?: string;
}

interface UserSession {
  userName: string;
  clientName: string;
  tokenCreated: Date;
  tokenExpiry: Date | null;
  isActive: boolean;
}

type TimeRange = '1h' | '24h' | '7d';

function formatTimestamp(d: Date): string {
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (isToday) return time;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function getHref(kind: string, name: string, namespace: string): string | undefined {
  const map: Record<string, string> = {
    Pod: `/workloads/pods/${namespace}/${name}`,
    Deployment: `/workloads/deployments/${namespace}/${name}`,
    ReplicaSet: `/workloads/replicasets/${namespace}/${name}`,
    StatefulSet: `/workloads/statefulsets/${namespace}/${name}`,
    DaemonSet: `/workloads/daemonsets/${namespace}/${name}`,
    Service: `/networking/services/${namespace}/${name}`,
    ConfigMap: `/workloads/configmaps/${namespace}/${name}`,
    Secret: `/workloads/secrets/${namespace}/${name}`,
    Job: `/workloads/jobs/${namespace}/${name}`,
    CronJob: `/workloads/cronjobs/${namespace}/${name}`,
    Ingress: `/networking/ingress/${namespace}/${name}`,
    Route: `/networking/routes/${namespace}/${name}`,
  };
  return map[kind];
}

const resourceApis: { kind: string; path: string }[] = [
  { kind: 'Deployment', path: '/apis/apps/v1/{ns}deployments' },
  { kind: 'StatefulSet', path: '/apis/apps/v1/{ns}statefulsets' },
  { kind: 'DaemonSet', path: '/apis/apps/v1/{ns}daemonsets' },
  { kind: 'Service', path: '/api/v1/{ns}services' },
  { kind: 'ConfigMap', path: '/api/v1/{ns}configmaps' },
  { kind: 'Secret', path: '/api/v1/{ns}secrets' },
  { kind: 'Job', path: '/apis/batch/v1/{ns}jobs' },
  { kind: 'CronJob', path: '/apis/batch/v1/{ns}cronjobs' },
  { kind: 'Ingress', path: '/apis/networking.k8s.io/v1/{ns}ingresses' },
];

const managerColor = (m: string): 'blue' | 'purple' | 'teal' | 'orange' | 'green' | 'grey' => {
  if (/helm/i.test(m)) return 'blue';
  if (/argo/i.test(m)) return 'purple';
  if (/kubectl/i.test(m)) return 'orange';
  if (/mozilla|chrome|safari/i.test(m)) return 'green';
  if (/event/i.test(m)) return 'teal';
  return 'grey';
};

const operationColor = (op: string): 'blue' | 'orange' | 'green' | 'red' | 'grey' => {
  if (op === 'Apply') return 'blue';
  if (op === 'Update') return 'orange';
  if (/create/i.test(op)) return 'green';
  if (/delete|kill/i.test(op)) return 'red';
  return 'grey';
};

/** Try to extract a user identity from resource annotations */
function extractUser(metadata: Record<string, unknown>): string | undefined {
  const annotations = (metadata['annotations'] ?? {}) as Record<string, string>;
  // OpenShift sets this on namespaces and some resources
  if (annotations['openshift.io/requester']) return annotations['openshift.io/requester'];
  // Sometimes set by GitOps
  if (annotations['kubectl.kubernetes.io/last-applied-by']) return annotations['kubectl.kubernetes.io/last-applied-by'];
  return undefined;
}

/** Build a map of active user sessions from OAuthAccessTokens, keyed by time window */
async function fetchUserSessions(cutoff: Date): Promise<UserSession[]> {
  const sessions: UserSession[] = [];
  try {
    const res = await fetch(`${BASE}/apis/oauth.openshift.io/v1/oauthaccesstokens`);
    if (!res.ok) return sessions;
    const data = await res.json() as { items: Record<string, unknown>[] };
    for (const token of data.items ?? []) {
      const userName = String((token)['userName'] ?? '');
      const clientName = String((token)['clientName'] ?? '');
      const metadata = ((token)['metadata'] ?? {}) as Record<string, unknown>;
      const created = new Date(String(metadata['creationTimestamp'] ?? ''));
      const expiresIn = Number((token)['expiresIn'] ?? 0);
      const expiry = expiresIn > 0 ? new Date(created.getTime() + expiresIn * 1000) : null;
      const isActive = !expiry || expiry.getTime() > Date.now();

      // Include if token was created in window or is still active
      if (created >= cutoff || isActive) {
        sessions.push({ userName, clientName, tokenCreated: created, tokenExpiry: expiry, isActive });
      }
    }
  } catch { /* OAuthAccessTokens may not be accessible */ }
  return sessions;
}

/** Build a map: timestamp range → which users had active sessions */
function buildUserTimeMap(sessions: UserSession[]): Map<string, Set<string>> {
  // Group sessions by user, track their active windows
  const userWindows = new Map<string, { start: Date; end: Date }[]>();
  for (const s of sessions) {
    const windows = userWindows.get(s.userName) ?? [];
    windows.push({
      start: s.tokenCreated,
      end: s.tokenExpiry ?? new Date(),
    });
    userWindows.set(s.userName, windows);
  }
  return new Map(
    Array.from(userWindows.entries()).map(([user, windows]) => [
      user,
      new Set(windows.map(() => user)),
    ])
  );
}

/** Find users who had active sessions at a given timestamp */
function findActiveUsers(sessions: UserSession[], timestamp: Date): string[] {
  return [...new Set(
    sessions
      .filter((s) => {
        const end = s.tokenExpiry ?? new Date();
        return s.tokenCreated <= timestamp && end >= timestamp;
      })
      .map((s) => s.userName)
  )];
}

export default function UserActivity() {
  const navigate = useNavigate();
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('24h');
  const [search, setSearch] = useState('');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sortIndex, setSortIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      setLoading(true);
      const cutoff = new Date();
      if (range === '1h') cutoff.setHours(cutoff.getHours() - 1);
      else if (range === '24h') cutoff.setHours(cutoff.getHours() - 24);
      else cutoff.setDate(cutoff.getDate() - 7);

      // Fetch user sessions in parallel with resource scanning
      const sessionsPromise = fetchUserSessions(cutoff);

      const allEntries: ActivityEntry[] = [];

      const nsPrefix = selectedNamespace !== 'all'
        ? `namespaces/${encodeURIComponent(selectedNamespace)}/`
        : '';

      for (const api of resourceApis) {
        const path = api.path.replace('{ns}', nsPrefix);
        try {
          const res = await fetch(`${BASE}${path}`);
          if (!res.ok) continue;
          const data = await res.json() as { items: Record<string, unknown>[] };

          for (const item of data.items ?? []) {
            const metadata = (item['metadata'] ?? {}) as Record<string, unknown>;
            const resourceName = String(metadata['name'] ?? '');
            const resourceNs = String(metadata['namespace'] ?? '');
            const user = extractUser(metadata);
            const managedFields = (metadata['managedFields'] ?? []) as {
              manager?: string;
              operation?: string;
              time?: string;
              fieldsV1?: Record<string, unknown>;
            }[];

            for (const field of managedFields) {
              if (!field.time) continue;
              const ts = new Date(field.time);
              if (ts < cutoff) continue;

              const manager = field.manager ?? 'unknown';
              const changedFields: string[] = [];
              if (field.fieldsV1) {
                for (const key of Object.keys(field.fieldsV1)) {
                  if (key.startsWith('f:')) changedFields.push(key.slice(2));
                }
              }

              allEntries.push({
                id: `${resourceNs}/${api.kind}/${resourceName}/${manager}/${field.time}`,
                manager,
                user: user ?? '',
                kind: api.kind,
                name: resourceName,
                namespace: resourceNs,
                operation: field.operation ?? 'Update',
                timestamp: ts,
                fields: changedFields.length > 0 ? changedFields : undefined,
                href: getHref(api.kind, resourceName, resourceNs),
              });
            }
          }
        } catch { /* ignore */ }
      }

      try {
        const evtPath = selectedNamespace !== 'all'
          ? `/api/v1/namespaces/${encodeURIComponent(selectedNamespace)}/events?limit=200`
          : '/api/v1/events?limit=200';
        const res = await fetch(`${BASE}${evtPath}`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          for (const evt of data.items ?? []) {
            const ts = new Date(String((evt as Record<string, unknown>)['lastTimestamp'] ?? (evt as Record<string, unknown>)['eventTime'] ?? ((evt as Record<string, unknown>)['metadata'] as Record<string, unknown>)?.['creationTimestamp'] ?? ''));
            if (ts < cutoff || isNaN(ts.getTime())) continue;

            const reason = String((evt as Record<string, unknown>)['reason'] ?? '');
            const actionReasons = ['ScalingReplicaSet', 'SuccessfulCreate', 'SuccessfulDelete', 'Killing', 'Created', 'Started'];
            if (!actionReasons.includes(reason)) continue;

            const involved = ((evt as Record<string, unknown>)['involvedObject'] ?? {}) as Record<string, unknown>;
            const objKind = String(involved['kind'] ?? '');
            const objName = String(involved['name'] ?? '');
            const objNs = String(involved['namespace'] ?? '');

            allEntries.push({
              id: `evt-${objNs}/${objKind}/${objName}/${reason}/${ts.getTime()}`,
              manager: 'K8s Event',
              user: '',
              kind: objKind,
              name: objName,
              namespace: objNs,
              operation: reason,
              timestamp: ts,
              href: getHref(objKind, objName, objNs),
            });
          }
        }
      } catch { /* ignore */ }

      const userSessions = await sessionsPromise;

      // Correlate: for each entry without a user, find which users had active sessions at that time
      for (const entry of allEntries) {
        if (!entry.user) {
          const activeUsers = findActiveUsers(userSessions, entry.timestamp);
          if (activeUsers.length === 1) {
            entry.user = activeUsers[0];
          } else if (activeUsers.length > 1) {
            entry.user = activeUsers.join(', ');
          }
        }
      }

      if (!cancelled) {
        allEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setEntries(allEntries);
        setSessions(userSessions);
        setLoading(false);
      }
    }

    loadActivity();
    return () => { cancelled = true; };
  }, [range, selectedNamespace]);

  // Filter
  let filtered = entries;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((e) =>
      e.manager.toLowerCase().includes(q) ||
      e.user.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.kind.toLowerCase().includes(q) ||
      e.namespace.toLowerCase().includes(q) ||
      e.operation.toLowerCase().includes(q) ||
      (e.fields ?? []).some((f) => f.toLowerCase().includes(q))
    );
  }
  if (selectedManager) {
    filtered = filtered.filter((e) => e.manager === selectedManager);
  }
  if (selectedUser) {
    filtered = filtered.filter((e) => e.user.includes(selectedUser));
  }

  // Sort
  const sortKeys = ['timestamp', 'user', 'manager', 'operation', 'kind', 'name', 'namespace', 'fields'];
  let sorted = filtered;
  if (sortIndex !== null && sortKeys[sortIndex]) {
    const key = sortKeys[sortIndex];
    sorted = [...filtered].sort((a, b) => {
      let aVal: string, bVal: string;
      if (key === 'timestamp') {
        aVal = String(a.timestamp.getTime());
        bVal = String(b.timestamp.getTime());
      } else if (key === 'fields') {
        aVal = (a.fields ?? []).join(',');
        bVal = (b.fields ?? []).join(',');
      } else {
        aVal = String((a as Record<string, unknown>)[key] ?? '');
        bVal = String((b as Record<string, unknown>)[key] ?? '');
      }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }

  // Paginate
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);

  // Unique managers and users for filter buttons
  const managers = [...new Set(entries.map((e) => e.manager))].sort();
  const users = [...new Set(entries.map((e) => e.user).filter((u) => u))].sort();

  const onSort = (_event: React.MouseEvent, index: number, direction: 'asc' | 'desc') => {
    setSortIndex(index);
    setSortDirection(direction);
  };

  // Summary counts
  const managerCounts = new Map<string, number>();
  for (const e of entries) managerCounts.set(e.manager, (managerCounts.get(e.manager) ?? 0) + 1);
  const userCounts = new Map<string, number>();
  for (const e of entries) if (e.user) userCounts.set(e.user, (userCounts.get(e.user) ?? 0) + 1);

  // Session table sort
  const [sessionSortIndex, setSessionSortIndex] = useState<number | null>(null);
  const [sessionSortDir, setSessionSortDir] = useState<'asc' | 'desc'>('desc');
  const [sessionSearch, setSessionSearch] = useState('');

  let filteredSessions = sessions;
  if (sessionSearch) {
    const q = sessionSearch.toLowerCase();
    filteredSessions = filteredSessions.filter((s) =>
      s.userName.toLowerCase().includes(q) || s.clientName.toLowerCase().includes(q)
    );
  }
  const sessionSortKeys = ['userName', 'clientName', 'tokenCreated', 'tokenExpiry', 'isActive'];
  if (sessionSortIndex !== null && sessionSortKeys[sessionSortIndex]) {
    const key = sessionSortKeys[sessionSortIndex];
    filteredSessions = [...filteredSessions].sort((a, b) => {
      let aVal: string, bVal: string;
      if (key === 'tokenCreated' || key === 'tokenExpiry') {
        aVal = String((a[key as keyof UserSession] as Date | null)?.getTime() ?? 0);
        bVal = String((b[key as keyof UserSession] as Date | null)?.getTime() ?? 0);
      } else {
        aVal = String(a[key as keyof UserSession] ?? '');
        bVal = String(b[key as keyof UserSession] ?? '');
      }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sessionSortDir === 'asc' ? cmp : -cmp;
    });
  }

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">User Activity</Title>
        <p className="os-text-muted">Audit trail with user correlation — resource changes matched to authenticated user sessions.</p>
      </PageSection>

      <PageSection>
        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Card style={{ flex: 1, minWidth: 120 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{entries.length}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Total Changes</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 120 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{users.length}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Users Identified</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 120 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{sessions.filter((s) => s.isActive).length}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Active Sessions</div>
            </CardBody>
          </Card>
          <Card style={{ flex: 1, minWidth: 120 }}>
            <CardBody style={{ textAlign: 'center', padding: '12px 16px' }}>
              <Title headingLevel="h3" size="2xl">{new Set(entries.map((e) => `${e.namespace}/${e.name}`)).size}</Title>
              <div className="os-text-muted" style={{ fontSize: 12 }}>Resources Touched</div>
            </CardBody>
          </Card>
        </div>

        <Tabs activeKey={activeTab} onSelect={(_, k) => setActiveTab(k as number)}>
          {/* Tab 1: Resource Changes */}
          <Tab eventKey={0} title={<TabTitleText>Resource Changes ({entries.length})</TabTitleText>}>
            <Card style={{ marginTop: 16 }}>
              <CardBody>
                <Toolbar>
                  <ToolbarContent>
                    <ToolbarItem>
                      <ToggleGroup aria-label="Time range">
                        <ToggleGroupItem text="1 hour" isSelected={range === '1h'} onChange={() => { setRange('1h'); setPage(1); }} />
                        <ToggleGroupItem text="24 hours" isSelected={range === '24h'} onChange={() => { setRange('24h'); setPage(1); }} />
                        <ToggleGroupItem text="7 days" isSelected={range === '7d'} onChange={() => { setRange('7d'); setPage(1); }} />
                      </ToggleGroup>
                    </ToolbarItem>
                    <ToolbarItem>
                      <SearchInput
                        placeholder="Search by user, tool, resource, kind..."
                        value={search}
                        onChange={(_e, val) => { setSearch(val); setPage(1); }}
                        onClear={() => { setSearch(''); setPage(1); }}
                        style={{ minWidth: 280 }}
                      />
                    </ToolbarItem>
                    <ToolbarItem variant="pagination" align={{ default: 'alignEnd' }}>
                      <Pagination
                        itemCount={filtered.length}
                        perPage={perPage}
                        page={page}
                        onSetPage={(_e, p) => setPage(p)}
                        onPerPageSelect={(_e, pp) => { setPerPage(pp); setPage(1); }}
                        isCompact
                      />
                    </ToolbarItem>
                  </ToolbarContent>
                </Toolbar>

                {/* User filter */}
                {users.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--os-text-secondary, #6a6e73)', marginRight: 4 }}>User:</span>
                    <Button variant={selectedUser === null ? 'primary' : 'secondary'} size="sm" onClick={() => { setSelectedUser(null); setPage(1); }}>All</Button>
                    {users.map((u) => (
                      <Button key={u} variant={selectedUser === u ? 'primary' : 'secondary'} size="sm" onClick={() => { setSelectedUser(selectedUser === u ? null : u); setPage(1); }}>
                        {u} ({userCounts.get(u) ?? 0})
                      </Button>
                    ))}
                  </div>
                )}

                {/* Tool filter */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--os-text-secondary, #6a6e73)', marginRight: 4 }}>Tool:</span>
                  <Button variant={selectedManager === null ? 'primary' : 'secondary'} size="sm" onClick={() => { setSelectedManager(null); setPage(1); }}>All</Button>
                  {managers.map((m) => (
                    <Button key={m} variant={selectedManager === m ? 'primary' : 'secondary'} size="sm" onClick={() => { setSelectedManager(selectedManager === m ? null : m); setPage(1); }}>
                      {m} ({managerCounts.get(m) ?? 0})
                    </Button>
                  ))}
                </div>

                <Table aria-label="User activity table" variant="compact">
                  <Thead>
                    <Tr>
                      {['When', 'User', 'Tool', 'Action', 'Kind', 'Resource', 'Namespace', 'Fields Changed'].map((title, i) => (
                        <Th key={title} sort={{ sortBy: sortIndex !== null ? { index: sortIndex, direction: sortDirection } : { direction: sortDirection }, onSort, columnIndex: i }}>
                          {title}
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {loading ? (
                      <Tr><Td colSpan={8}><span className="os-text-muted">Scanning resources and correlating user sessions...</span></Td></Tr>
                    ) : paginated.length === 0 ? (
                      <Tr><Td colSpan={8}><span className="os-text-muted">No activity found.</span></Td></Tr>
                    ) : (
                      paginated.map((entry, i) => (
                        <Tr
                          key={entry.id + i}
                          isClickable={!!entry.href}
                          onRowClick={entry.href ? () => navigate(entry.href!) : undefined}
                          className={entry.href ? 'os-list__row--clickable' : ''}
                        >
                          <Td dataLabel="When" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                            {formatTimestamp(entry.timestamp)}
                          </Td>
                          <Td dataLabel="User">
                            {entry.user ? (
                              <strong style={{ fontSize: 13 }}>{entry.user}</strong>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--os-text-muted, #8a8d90)' }}>-</span>
                            )}
                          </Td>
                          <Td dataLabel="Tool">
                            <Label color={managerColor(entry.manager)} isCompact>{entry.manager}</Label>
                          </Td>
                          <Td dataLabel="Action">
                            <Label color={operationColor(entry.operation)} isCompact>{entry.operation}</Label>
                          </Td>
                          <Td dataLabel="Kind" style={{ fontSize: 13 }}>{entry.kind}</Td>
                          <Td dataLabel="Resource"><strong style={{ fontSize: 13 }}>{entry.name}</strong></Td>
                          <Td dataLabel="Namespace" style={{ fontSize: 13, color: 'var(--os-text-muted, #8a8d90)' }}>{entry.namespace}</Td>
                          <Td dataLabel="Fields Changed" style={{ fontSize: 12, color: 'var(--os-text-secondary, #6a6e73)' }}>
                            {entry.fields && entry.fields.length > 0
                              ? entry.fields.slice(0, 3).join(', ') + (entry.fields.length > 3 ? ` +${entry.fields.length - 3}` : '')
                              : '-'}
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </Tab>

          {/* Tab 2: User Sessions */}
          <Tab eventKey={1} title={<TabTitleText>User Sessions ({sessions.length})</TabTitleText>}>
            <Card style={{ marginTop: 16 }}>
              <CardBody>
                <Toolbar>
                  <ToolbarContent>
                    <ToolbarItem>
                      <SearchInput
                        placeholder="Search by username or client..."
                        value={sessionSearch}
                        onChange={(_e, val) => setSessionSearch(val)}
                        onClear={() => setSessionSearch('')}
                        style={{ minWidth: 280 }}
                      />
                    </ToolbarItem>
                    <ToolbarItem>
                      <span className="os-text-muted" style={{ fontSize: 13 }}>{filteredSessions.length} sessions from OAuthAccessTokens</span>
                    </ToolbarItem>
                  </ToolbarContent>
                </Toolbar>

                <Table aria-label="User sessions table" variant="compact">
                  <Thead>
                    <Tr>
                      {['User', 'Client', 'Session Started', 'Session Expires', 'Status'].map((title, i) => (
                        <Th key={title} sort={{
                          sortBy: sessionSortIndex !== null ? { index: sessionSortIndex, direction: sessionSortDir } : { direction: sessionSortDir },
                          onSort: (_e, idx, dir) => { setSessionSortIndex(idx); setSessionSortDir(dir); },
                          columnIndex: i,
                        }}>
                          {title}
                        </Th>
                      ))}
                      <Th>Changes</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {loading ? (
                      <Tr><Td colSpan={6}><span className="os-text-muted">Loading sessions...</span></Td></Tr>
                    ) : filteredSessions.length === 0 ? (
                      <Tr><Td colSpan={6}><span className="os-text-muted">No OAuth sessions found. This API requires cluster-admin access.</span></Td></Tr>
                    ) : (
                      filteredSessions.map((session, i) => {
                        const changeCount = entries.filter((e) => e.user === session.userName).length;
                        return (
                          <Tr
                            key={`${session.userName}-${i}`}
                            isClickable={changeCount > 0}
                            onRowClick={changeCount > 0 ? () => {
                              setSelectedUser(session.userName);
                              setActiveTab(0);
                              setPage(1);
                            } : undefined}
                            className={changeCount > 0 ? 'os-list__row--clickable' : ''}
                          >
                            <Td dataLabel="User"><strong style={{ fontSize: 13 }}>{session.userName}</strong></Td>
                            <Td dataLabel="Client" style={{ fontSize: 13 }}>{session.clientName}</Td>
                            <Td dataLabel="Session Started" style={{ fontSize: 13 }}>{formatTimestamp(session.tokenCreated)}</Td>
                            <Td dataLabel="Session Expires" style={{ fontSize: 13 }}>
                              {session.tokenExpiry ? formatTimestamp(session.tokenExpiry) : '-'}
                            </Td>
                            <Td dataLabel="Status">
                              <Label color={session.isActive ? 'green' : 'grey'} isCompact>
                                {session.isActive ? 'Active' : 'Expired'}
                              </Label>
                            </Td>
                            <Td dataLabel="Changes">
                              {changeCount > 0 ? (
                                <Label color="blue" isCompact>{changeCount} changes</Label>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--os-text-muted, #8a8d90)' }}>0</span>
                              )}
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
}
