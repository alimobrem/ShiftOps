import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageSection, Title, Card, CardBody, Button, Label, Grid, GridItem,
  Select, SelectOption, MenuToggle,
} from '@patternfly/react-core';
import StatusIndicator from '@/components/StatusIndicator';
import { useClusterStore } from '@/store/useClusterStore';
import '@/openshift-components.css';

const BASE = '/api/kubernetes';

interface UnhealthyResource {
  kind: string;
  name: string;
  namespace: string;
  status: string;
  message: string;
  href: string;
}

interface ResourceEvent {
  reason: string;
  message: string;
  type: string;
  count: number;
  lastSeen: string;
}

type Step = 'namespace' | 'resources' | 'detail';

export default function Troubleshoot() {
  const navigate = useNavigate();
  const storeNamespaces = useClusterStore((s) => s.namespaces);

  const [step, setStep] = useState<Step>('namespace');
  const [selectedNs, setSelectedNs] = useState('');
  const [nsOpen, setNsOpen] = useState(false);
  const [unhealthy, setUnhealthy] = useState<UnhealthyResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<UnhealthyResource | null>(null);
  const [events, setEvents] = useState<ResourceEvent[]>([]);
  const [logs, setLogs] = useState('');
  const [eventsLoading, setEventsLoading] = useState(false);

  // Fetch namespaces from API if store is empty
  const [namespaces, setNamespaces] = useState<string[]>([]);
  useEffect(() => {
    if (storeNamespaces.length > 0) {
      setNamespaces(storeNamespaces.map((n) => typeof n === 'string' ? n : (n as { name: string }).name));
      return;
    }
    async function load() {
      try {
        const res = await fetch(`${BASE}/api/v1/namespaces`);
        if (!res.ok) return;
        const json = await res.json() as { items?: { metadata: { name: string } }[] };
        setNamespaces((json.items ?? []).map((n) => n.metadata.name));
      } catch { /* ignore */ }
    }
    load();
  }, [storeNamespaces]);

  // Step 2: find unhealthy resources in namespace
  const scanNamespace = useCallback(async (ns: string) => {
    setLoading(true);
    setUnhealthy([]);
    const items: UnhealthyResource[] = [];

    // Check pods
    try {
      const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(ns)}/pods`);
      if (res.ok) {
        const json = await res.json() as { items?: Record<string, unknown>[] };
        for (const pod of json.items ?? []) {
          const meta = pod['metadata'] as Record<string, unknown>;
          const status = pod['status'] as Record<string, unknown>;
          const phase = String(status?.['phase'] ?? '');
          const containerStatuses = (status?.['containerStatuses'] ?? []) as Record<string, unknown>[];
          const restarts = containerStatuses.reduce((sum, cs) => sum + Number(cs['restartCount'] ?? 0), 0);
          const waiting = containerStatuses.some((cs) => {
            const state = cs['state'] as Record<string, unknown> | undefined;
            return state?.['waiting'] !== undefined;
          });

          if (phase !== 'Running' && phase !== 'Succeeded' || restarts > 5 || waiting) {
            const reason = waiting ? 'Container waiting' : restarts > 5 ? `${restarts} restarts` : phase;
            items.push({
              kind: 'Pod', name: String(meta?.['name'] ?? ''), namespace: ns,
              status: phase, message: reason,
              href: `/workloads/pods/${ns}/${meta?.['name']}`,
            });
          }
        }
      }
    } catch { /* ignore */ }

    // Check deployments
    try {
      const res = await fetch(`${BASE}/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/deployments`);
      if (res.ok) {
        const json = await res.json() as { items?: Record<string, unknown>[] };
        for (const dep of json.items ?? []) {
          const meta = dep['metadata'] as Record<string, unknown>;
          const status = dep['status'] as Record<string, unknown>;
          const spec = dep['spec'] as Record<string, unknown>;
          const desired = Number(spec?.['replicas'] ?? 0);
          const ready = Number(status?.['readyReplicas'] ?? 0);
          if (desired > 0 && ready < desired) {
            items.push({
              kind: 'Deployment', name: String(meta?.['name'] ?? ''), namespace: ns,
              status: 'Degraded', message: `${ready}/${desired} replicas ready`,
              href: `/workloads/deployments/${ns}/${meta?.['name']}`,
            });
          }
        }
      }
    } catch { /* ignore */ }

    setUnhealthy(items);
    setLoading(false);
    setStep('resources');
  }, []);

  // Step 3: get events and logs for selected resource
  const drillInto = useCallback(async (resource: UnhealthyResource) => {
    setSelectedResource(resource);
    setEventsLoading(true);
    setEvents([]);
    setLogs('');
    setStep('detail');

    // Fetch events
    try {
      const fieldSelector = `involvedObject.name=${encodeURIComponent(resource.name)}`;
      const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(resource.namespace)}/events?fieldSelector=${fieldSelector}`);
      if (res.ok) {
        const json = await res.json() as { items?: Record<string, unknown>[] };
        setEvents((json.items ?? []).map((e) => ({
          reason: String(e['reason'] ?? ''),
          message: String(e['message'] ?? ''),
          type: String(e['type'] ?? 'Normal'),
          count: Number(e['count'] ?? 1),
          lastSeen: String(((e['metadata'] as Record<string, unknown>)?.['creationTimestamp'] ?? '')),
        })));
      }
    } catch { /* ignore */ }

    // Fetch logs if pod
    if (resource.kind === 'Pod') {
      try {
        const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(resource.namespace)}/pods/${encodeURIComponent(resource.name)}/log?tailLines=50`);
        if (res.ok) setLogs(await res.text());
      } catch { /* ignore */ }
    }

    setEventsLoading(false);
  }, []);

  return (
    <>
      <PageSection variant="default">
        <Title headingLevel="h1" size="2xl">Troubleshoot</Title>
        <p className="os-text-muted">Guided diagnostics to find and fix issues in your cluster</p>
      </PageSection>

      <PageSection>
        {/* Step indicator */}
        <div className="os-troubleshoot__steps">
          <Label color={step === 'namespace' ? 'blue' : 'green'} onClick={() => setStep('namespace')} style={{ cursor: 'pointer' }}>
            1. Select Namespace
          </Label>
          <span className="os-troubleshoot__arrow">&rarr;</span>
          <Label color={step === 'resources' ? 'blue' : unhealthy.length > 0 ? 'green' : 'grey'}>
            2. Unhealthy Resources
          </Label>
          <span className="os-troubleshoot__arrow">&rarr;</span>
          <Label color={step === 'detail' ? 'blue' : 'grey'}>
            3. Diagnose & Fix
          </Label>
        </div>

        {/* Step 1: Pick namespace */}
        {step === 'namespace' && (
          <Card className="os-troubleshoot__card">
            <CardBody>
              <Title headingLevel="h3" size="lg">Select a namespace to scan</Title>
              <p className="os-text-muted" style={{ margin: '8px 0 16px' }}>
                We'll check for failing pods, degraded deployments, and warning events.
              </p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Select
                  isOpen={nsOpen}
                  selected={selectedNs}
                  onSelect={(_e, val) => { setSelectedNs(val as string); setNsOpen(false); }}
                  onOpenChange={setNsOpen}
                  toggle={(ref) => (
                    <MenuToggle ref={ref} onClick={() => setNsOpen(!nsOpen)} style={{ minWidth: 250 }}>
                      {selectedNs || 'Choose namespace...'}
                    </MenuToggle>
                  )}
                >
                  {namespaces.map((ns) => (
                    <SelectOption key={ns} value={ns}>{ns}</SelectOption>
                  ))}
                </Select>
                <Button variant="primary" isDisabled={!selectedNs} onClick={() => scanNamespace(selectedNs)}>
                  Scan
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Step 2: Show unhealthy resources */}
        {step === 'resources' && (
          <Card className="os-troubleshoot__card">
            <CardBody>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Title headingLevel="h3" size="lg">
                  {loading ? 'Scanning...' : `${unhealthy.length} issue${unhealthy.length !== 1 ? 's' : ''} in ${selectedNs}`}
                </Title>
                <Button variant="link" onClick={() => setStep('namespace')}>Change namespace</Button>
              </div>

              {!loading && unhealthy.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <StatusIndicator status="Ready" />
                  <p style={{ marginTop: 8 }}>No issues found. All resources in <strong>{selectedNs}</strong> are healthy.</p>
                </div>
              )}

              {unhealthy.map((r) => (
                <div key={`${r.kind}-${r.name}`} className="os-troubleshoot__resource-row" onClick={() => drillInto(r)}>
                  <div>
                    <Label color={r.kind === 'Pod' ? 'purple' : 'blue'} className="pf-v5-u-mr-sm">{r.kind}</Label>
                    <strong>{r.name}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="os-text-muted">{r.message}</span>
                    <StatusIndicator status={r.status} />
                    <Button variant="link" size="sm">Diagnose &rarr;</Button>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Step 3: Diagnose & Fix */}
        {step === 'detail' && selectedResource && (
          <Grid hasGutter>
            <GridItem md={12}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <Label color={selectedResource.kind === 'Pod' ? 'purple' : 'blue'}>{selectedResource.kind}</Label>
                  <Title headingLevel="h3" size="lg" style={{ display: 'inline', marginLeft: 8 }}>{selectedResource.name}</Title>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="link" onClick={() => setStep('resources')}>&larr; Back to list</Button>
                  <Button variant="secondary" onClick={() => navigate(selectedResource.href)}>View Details</Button>
                  {selectedResource.kind === 'Pod' && (
                    <Button variant="primary" onClick={() => navigate(`${selectedResource.href}?tab=logs`)}>View Logs</Button>
                  )}
                </div>
              </div>
            </GridItem>

            {/* Suggested Actions */}
            <GridItem md={4}>
              <Card>
                <CardBody>
                  <Title headingLevel="h4" size="md" className="os-troubleshoot__section-title">Suggested Actions</Title>
                  <div className="os-troubleshoot__actions-list">
                    {selectedResource.kind === 'Pod' && (
                      <>
                        <Button variant="secondary" isBlock onClick={() => navigate(`${selectedResource.href}?tab=logs`)}>
                          Check Logs
                        </Button>
                        <Button variant="secondary" isBlock onClick={async () => {
                          try {
                            await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(selectedResource.namespace)}/pods/${encodeURIComponent(selectedResource.name)}`, { method: 'DELETE' });
                          } catch { /* ignore */ }
                          scanNamespace(selectedNs);
                        }}>
                          Restart Pod
                        </Button>
                      </>
                    )}
                    {selectedResource.kind === 'Deployment' && (
                      <>
                        <Button variant="secondary" isBlock onClick={() => navigate(selectedResource.href)}>
                          Check Deployment
                        </Button>
                        <Button variant="secondary" isBlock onClick={async () => {
                          try {
                            const res = await fetch(`${BASE}/apis/apps/v1/namespaces/${encodeURIComponent(selectedResource.namespace)}/deployments/${encodeURIComponent(selectedResource.name)}`);
                            if (!res.ok) return;
                            const dep = await res.json() as Record<string, unknown>;
                            const spec = dep['spec'] as Record<string, unknown>;
                            const replicas = Number(spec?.['replicas'] ?? 1);
                            await fetch(`${BASE}/apis/apps/v1/namespaces/${encodeURIComponent(selectedResource.namespace)}/deployments/${encodeURIComponent(selectedResource.name)}/scale`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ apiVersion: 'autoscaling/v1', kind: 'Scale', metadata: { name: selectedResource.name, namespace: selectedResource.namespace }, spec: { replicas: replicas + 1 } }),
                            });
                          } catch { /* ignore */ }
                          scanNamespace(selectedNs);
                        }}>
                          Scale Up (+1)
                        </Button>
                      </>
                    )}
                    <Button variant="link" isBlock onClick={() => navigate(selectedResource.href)}>
                      View Full Details
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </GridItem>

            {/* Events */}
            <GridItem md={8}>
              <Card>
                <CardBody>
                  <Title headingLevel="h4" size="md" className="os-troubleshoot__section-title">
                    Events {!eventsLoading && <Label color="grey">{events.length}</Label>}
                  </Title>
                  {eventsLoading ? (
                    <p className="os-text-muted">Loading events...</p>
                  ) : events.length === 0 ? (
                    <p className="os-text-muted">No events found for this resource.</p>
                  ) : (
                    <div className="os-troubleshoot__events">
                      {events.map((e, i) => (
                        <div key={i} className="os-troubleshoot__event-row">
                          <span className={`os-troubleshoot__event-dot os-troubleshoot__event-dot--${e.type === 'Warning' ? 'warn' : 'ok'}`} />
                          <span className="os-troubleshoot__event-reason">{e.reason}</span>
                          <span className="os-troubleshoot__event-msg">{e.message}</span>
                          {e.count > 1 && <Label color="grey">x{e.count}</Label>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Logs (pods only) */}
              {selectedResource.kind === 'Pod' && logs && (
                <Card style={{ marginTop: 16 }}>
                  <CardBody>
                    <Title headingLevel="h4" size="md" className="os-troubleshoot__section-title">Last 50 Log Lines</Title>
                    <pre className="os-troubleshoot__logs">{logs}</pre>
                  </CardBody>
                </Card>
              )}
            </GridItem>
          </Grid>
        )}
      </PageSection>

      <style>{`
        .os-troubleshoot__steps { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .os-troubleshoot__arrow { color: var(--pf-t--global--color--disabled--default, #6a6e73); }
        .os-troubleshoot__card { margin-bottom: 16px; }
        .os-troubleshoot__resource-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--pf-t--global--border--color--default, #d2d2d2); border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: background 0.15s; }
        .os-troubleshoot__resource-row:hover { background: rgba(0, 0, 0, 0.03); }
        .dark .os-troubleshoot__resource-row:hover { background: rgba(255, 255, 255, 0.05); }
        .os-troubleshoot__section-title { margin-bottom: 12px; }
        .os-troubleshoot__actions-list { display: flex; flex-direction: column; gap: 8px; }
        .os-troubleshoot__events { display: flex; flex-direction: column; gap: 4px; }
        .os-troubleshoot__event-row { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 13px; }
        .os-troubleshoot__event-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }
        .os-troubleshoot__event-dot--ok { background: #3e8635; }
        .os-troubleshoot__event-dot--warn { background: #f0ab00; }
        .os-troubleshoot__event-reason { font-weight: 600; flex-shrink: 0; min-width: 100px; }
        .os-troubleshoot__event-msg { color: var(--pf-t--global--color--disabled--default, #6a6e73); flex: 1; }
        .os-troubleshoot__logs { font-family: 'SF Mono', monospace; font-size: 12px; line-height: 1.5; background: rgba(15, 23, 42, 0.95); color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
      `}</style>
    </>
  );
}
