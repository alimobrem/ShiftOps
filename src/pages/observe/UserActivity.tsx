import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageSection, Title, Card, CardBody, Label, Button,
  ToggleGroup, ToggleGroupItem, SearchInput,
  Toolbar, ToolbarContent, ToolbarItem,
} from '@patternfly/react-core';
import { useClusterStore } from '@/store/useClusterStore';

const BASE = '/api/kubernetes';

interface ActivityEntry {
  id: string;
  manager: string;
  kind: string;
  name: string;
  namespace: string;
  operation: string;
  timestamp: Date;
  fields?: string[];
  href?: string;
}

type TimeRange = '1h' | '24h' | '7d';

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d: Date): string {
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
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

export default function UserActivity() {
  const navigate = useNavigate();
  const selectedNamespace = useClusterStore((s) => s.selectedNamespace);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<TimeRange>('24h');
  const [search, setSearch] = useState('');
  const [selectedManager, setSelectedManager] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadActivity() {
      setLoading(true);
      const cutoff = new Date();
      if (range === '1h') cutoff.setHours(cutoff.getHours() - 1);
      else if (range === '24h') cutoff.setHours(cutoff.getHours() - 24);
      else cutoff.setDate(cutoff.getDate() - 7);

      const allEntries: ActivityEntry[] = [];

      const nsPrefix = selectedNamespace !== 'all'
        ? `namespaces/${encodeURIComponent(selectedNamespace)}/`
        : '';

      // Fetch managedFields from key resource types
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
              // Extract top-level field names from fieldsV1
              const changedFields: string[] = [];
              if (field.fieldsV1) {
                for (const key of Object.keys(field.fieldsV1)) {
                  if (key.startsWith('f:')) changedFields.push(key.slice(2));
                }
              }

              allEntries.push({
                id: `${resourceNs}/${api.kind}/${resourceName}/${manager}/${field.time}`,
                manager,
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

      // Also fetch events for create/delete/scale actions
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

      if (!cancelled) {
        allEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setEntries(allEntries);
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
      e.name.toLowerCase().includes(q) ||
      e.kind.toLowerCase().includes(q)
    );
  }
  if (selectedManager) {
    filtered = filtered.filter((e) => e.manager === selectedManager);
  }

  // Group by date
  const groups = new Map<string, ActivityEntry[]>();
  for (const entry of filtered) {
    const key = formatDate(entry.timestamp);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  // Unique managers for filter
  const managers = [...new Set(entries.map((e) => e.manager))].sort();

  const managerColor = (m: string): 'blue' | 'purple' | 'teal' | 'orange' | 'green' | 'grey' => {
    if (/helm/i.test(m)) return 'blue';
    if (/argo/i.test(m)) return 'purple';
    if (/kubectl/i.test(m)) return 'orange';
    if (/mozilla|chrome|safari/i.test(m)) return 'green';
    if (/event/i.test(m)) return 'teal';
    return 'grey';
  };

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">User Activity</Title>
        <p className="os-text-muted">Who changed what, when — audit trail from managedFields and K8s events</p>
      </PageSection>

      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <ToggleGroup aria-label="Time range">
                <ToggleGroupItem text="1 hour" isSelected={range === '1h'} onChange={() => setRange('1h')} />
                <ToggleGroupItem text="24 hours" isSelected={range === '24h'} onChange={() => setRange('24h')} />
                <ToggleGroupItem text="7 days" isSelected={range === '7d'} onChange={() => setRange('7d')} />
              </ToggleGroup>
            </ToolbarItem>
            <ToolbarItem>
              <SearchInput
                placeholder="Search by user, resource, kind..."
                value={search}
                onChange={(_e, val) => setSearch(val)}
                onClear={() => setSearch('')}
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <Button
            variant={selectedManager === null ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSelectedManager(null)}
          >
            All ({entries.length})
          </Button>
          {managers.map((m) => (
            <Button
              key={m}
              variant={selectedManager === m ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSelectedManager(selectedManager === m ? null : m)}
            >
              {m} ({entries.filter((e) => e.manager === m).length})
            </Button>
          ))}
        </div>

        {loading ? (
          <Card><CardBody><p className="os-text-muted">Scanning resources for activity...</p></CardBody></Card>
        ) : filtered.length === 0 ? (
          <Card><CardBody><p className="os-text-muted">No activity found in the selected time range.</p></CardBody></Card>
        ) : (
          Array.from(groups.entries()).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--os-text-secondary, #6a6e73)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {date}
              </div>
              <Card>
                <CardBody style={{ padding: 0 }}>
                  {items.map((entry, i) => (
                    <div
                      key={entry.id + i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px',
                        borderBottom: i < items.length - 1 ? '1px solid var(--modern-border, #e0e0e0)' : 'none',
                        cursor: entry.href ? 'pointer' : 'default',
                      }}
                      onClick={() => entry.href && navigate(entry.href)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, minWidth: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.operation === 'Apply' ? '#0066cc' : entry.operation === 'Update' ? '#f0ab00' : '#3e8635', flexShrink: 0 }} />
                        {i < items.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--modern-border, #e0e0e0)', marginTop: 4, minHeight: 20 }} />}
                      </div>
                      <div style={{ minWidth: 50, fontSize: 12, color: 'var(--os-text-muted, #8a8d90)', paddingTop: 1, flexShrink: 0 }}>
                        {formatTime(entry.timestamp)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Label color={managerColor(entry.manager)} style={{ fontSize: 10 }}>{entry.manager}</Label>
                          <Label color="grey" style={{ fontSize: 10 }}>{entry.kind}</Label>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{entry.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--os-text-muted, #8a8d90)' }}>{entry.namespace}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--os-text-secondary, #6a6e73)', marginTop: 3 }}>
                          <strong>{entry.operation}</strong>
                          {entry.fields && entry.fields.length > 0 && (
                            <span> — fields: {entry.fields.slice(0, 5).join(', ')}{entry.fields.length > 5 ? ` +${entry.fields.length - 5} more` : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ))
        )}
      </PageSection>
    </>
  );
}
