import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Label, Button, Title } from '@patternfly/react-core';
import StatusIndicator from './StatusIndicator';

const BASE = '/api/kubernetes';

interface RelatedItem {
  kind: string;
  name: string;
  namespace?: string;
  status?: string;
  href: string;
}

interface RelatedResourcesProps {
  kind: string;
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
}

export default function RelatedResources({ kind, name, namespace, labels }: RelatedResourcesProps) {
  const navigate = useNavigate();
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [events, setEvents] = useState<{ reason: string; message: string; type: string; timestamp: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRelated() {
      const items: RelatedItem[] = [];

      // Fetch pods owned by this resource (for Deployments, StatefulSets, etc.)
      if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job'].includes(kind) && namespace) {
        try {
          const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods`);
          if (res.ok) {
            const json = await res.json() as { items?: Record<string, unknown>[] };
            for (const pod of json.items ?? []) {
              const meta = pod['metadata'] as Record<string, unknown>;
              const status = pod['status'] as Record<string, unknown>;
              const owners = (meta?.['ownerReferences'] ?? []) as Record<string, unknown>[];
              const podLabels = (meta?.['labels'] ?? {}) as Record<string, string>;

              // Check owner references or label match
              const ownedByThis = owners.some((o) => {
                const ownerName = String(o['name'] ?? '');
                return ownerName === name || ownerName.startsWith(name + '-');
              });
              const labelsMatch = labels && Object.entries(labels).some(([k, v]) => podLabels[k] === v);

              if (ownedByThis || labelsMatch) {
                items.push({
                  kind: 'Pod',
                  name: String(meta?.['name'] ?? ''),
                  namespace: String(meta?.['namespace'] ?? ''),
                  status: String(status?.['phase'] ?? 'Unknown'),
                  href: `/workloads/pods/${meta?.['namespace']}/${meta?.['name']}`,
                });
              }
            }
          }
        } catch { /* ignore */ }
      }

      // Fetch services matching labels (for Deployments)
      if (['Deployment', 'StatefulSet'].includes(kind) && namespace && labels) {
        try {
          const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/services`);
          if (res.ok) {
            const json = await res.json() as { items?: Record<string, unknown>[] };
            for (const svc of json.items ?? []) {
              const meta = svc['metadata'] as Record<string, unknown>;
              const spec = svc['spec'] as Record<string, unknown>;
              const selector = (spec?.['selector'] ?? {}) as Record<string, string>;

              // Check if service selector matches any of our labels
              const matches = Object.entries(selector).some(([k, v]) => labels[k] === v);
              if (matches) {
                items.push({
                  kind: 'Service',
                  name: String(meta?.['name'] ?? ''),
                  namespace: String(meta?.['namespace'] ?? ''),
                  status: String(spec?.['type'] ?? 'ClusterIP'),
                  href: `/networking/services/${meta?.['namespace']}/${meta?.['name']}`,
                });
              }
            }
          }
        } catch { /* ignore */ }
      }

      // Fetch events for this resource
      if (namespace) {
        try {
          const fieldSelector = `involvedObject.name=${encodeURIComponent(name)}&involvedObject.namespace=${encodeURIComponent(namespace)}`;
          const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/events?fieldSelector=${fieldSelector}`);
          if (res.ok) {
            const json = await res.json() as { items?: Record<string, unknown>[] };
            if (!cancelled) {
              setEvents((json.items ?? []).map((e) => ({
                reason: String((e['reason'] ?? '')),
                message: String((e['message'] ?? '')),
                type: String((e['type'] ?? 'Normal')),
                timestamp: String(((e['metadata'] as Record<string, unknown>)?.['creationTimestamp'] ?? '')),
              })).slice(0, 10));
            }
          }
        } catch { /* ignore */ }
      }

      if (!cancelled) {
        setRelated(items);
        setLoading(false);
      }
    }

    fetchRelated();
    return () => { cancelled = true; };
  }, [kind, name, namespace, JSON.stringify(labels)]);

  if (loading) return <div className="os-text-muted">Loading related resources...</div>;

  const grouped = new Map<string, RelatedItem[]>();
  for (const item of related) {
    const list = grouped.get(item.kind) ?? [];
    list.push(item);
    grouped.set(item.kind, list);
  }

  return (
    <div className="os-related">
      {related.length === 0 && events.length === 0 && (
        <div className="os-text-muted">No related resources found.</div>
      )}

      {Array.from(grouped.entries()).map(([groupKind, items]) => (
        <Card key={groupKind} className="os-related__card">
          <CardBody>
            <Title headingLevel="h4" size="md" className="os-related__group-title">
              {groupKind}s <Label color="blue">{items.length}</Label>
            </Title>
            <div className="os-related__list">
              {items.map((item) => (
                <div key={`${item.kind}-${item.name}`} className="os-related__row" onClick={() => navigate(item.href)}>
                  <span className="os-related__name">{item.name}</span>
                  {item.status && <StatusIndicator status={item.status} />}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}

      {events.length > 0 && (
        <Card className="os-related__card">
          <CardBody>
            <Title headingLevel="h4" size="md" className="os-related__group-title">
              Events <Label color="grey">{events.length}</Label>
            </Title>
            <div className="os-related__list">
              {events.map((e, i) => (
                <div key={i} className="os-related__event">
                  <span className={`os-related__event-dot os-related__event-dot--${e.type === 'Warning' ? 'warn' : 'ok'}`} />
                  <span className="os-related__event-reason">{e.reason}</span>
                  <span className="os-related__event-msg">{e.message}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <style>{`
        .os-related { display: flex; flex-direction: column; gap: 16px; }
        .os-related__card { margin-bottom: 0; }
        .os-related__group-title { margin-bottom: 8px; }
        .os-related__list { display: flex; flex-direction: column; }
        .os-related__row { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); cursor: pointer; border-radius: 4px; }
        .os-related__row:hover { background: rgba(0, 0, 0, 0.04); }
        .dark .os-related__row:hover { background: rgba(255, 255, 255, 0.06); }
        .os-related__row:last-child { border-bottom: none; }
        .os-related__name { font-weight: 500; font-size: 13px; }
        .os-related__event { display: flex; align-items: flex-start; gap: 8px; padding: 4px 8px; font-size: 13px; }
        .os-related__event-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }
        .os-related__event-dot--ok { background: #3e8635; }
        .os-related__event-dot--warn { background: #f0ab00; }
        .os-related__event-reason { font-weight: 600; flex-shrink: 0; }
        .os-related__event-msg { color: var(--pf-t--global--color--disabled--default, #6a6e73); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </div>
  );
}
