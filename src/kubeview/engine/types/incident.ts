/**
 * Canonical Incident Model — normalizes findings, alerts, errors, timeline
 * entries, and fleet alerts into a single IncidentItem shape for unified
 * display and correlation.
 */

import type { Finding, ResourceRef } from '../monitorClient';
import type { TimelineEntry } from './timeline';
import type { TrackedError } from '../../store/errorStore';
import type { ErrorCategory } from '../errors';

export type Freshness = 'new' | 'recent' | 'stale';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export function computeFreshness(timestampMs: number, now = Date.now()): Freshness {
  const age = now - timestampMs;
  if (age < FIVE_MINUTES_MS) return 'new';
  if (age < ONE_HOUR_MS) return 'recent';
  return 'stale';
}

export type IncidentSeverity = 'critical' | 'warning' | 'info';

function normalizeSeverity(raw: string): IncidentSeverity {
  const lower = raw.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'warning') return 'warning';
  return 'info';
}

/** Maps TimelineSeverity "normal" to IncidentSeverity "info". */
const TIMELINE_SEVERITY_MAP: Record<string, IncidentSeverity> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
  normal: 'info',
};

export type IncidentSource =
  | 'finding'
  | 'prometheus-alert'
  | 'tracked-error'
  | 'timeline-entry'
  | 'fleet-alert';

export type IncidentStatus = 'active' | 'resolved' | 'acknowledged';

export interface IncidentItem {
  id: string;
  source: IncidentSource;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  detail: string;
  timestamp: number;
  freshness: Freshness;
  namespace?: string;
  resources: ResourceRef[];
  category: string;
  autoFixable: boolean;
  correlationKey: string;
  sourceRef: string;
  clusterId?: string;
  /** Original object for drill-down / detail views. */
  sourceData?: Record<string, unknown>;
}

export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'firing' | 'pending' | 'inactive';
  activeAt?: string;
}

export interface FleetAlert {
  clusterId: string;
  clusterName: string;
  alertName: string;
  severity: string;
  namespace: string;
  state: string;
  activeAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

/** Simple hash for deterministic IDs from labels */
function labelsHash(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  let h = 0;
  for (const k of keys) {
    const s = `${k}=${labels[k]}`;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
  }
  return (h >>> 0).toString(36);
}

export function findingToIncident(f: Finding, now = Date.now()): IncidentItem {
  return {
    id: f.id,
    source: 'finding',
    severity: f.severity,
    status: 'active',
    title: f.title,
    detail: f.summary,
    timestamp: f.timestamp,
    freshness: computeFreshness(f.timestamp, now),
    namespace: f.resources[0]?.namespace,
    resources: f.resources,
    category: f.category,
    autoFixable: false,
    correlationKey: f.resources[0]
      ? `${f.resources[0].kind}/${f.resources[0].name}/${f.resources[0].namespace ?? '_'}`
      : `finding:${f.id}`,
    sourceRef: `finding:${f.id}`,
    sourceData: f as unknown as Record<string, unknown>,
  };
}

export function prometheusAlertToIncident(
  alert: PrometheusAlert,
  now = Date.now(),
): IncidentItem {
  const ts = alert.activeAt ? new Date(alert.activeAt).getTime() : now;
  const severity = normalizeSeverity(alert.labels.severity ?? 'info');
  const namespace = alert.labels.namespace;
  const resources: ResourceRef[] = [];
  if (alert.labels.pod) {
    resources.push({ kind: 'Pod', name: alert.labels.pod, namespace });
  }
  if (alert.labels.deployment) {
    resources.push({ kind: 'Deployment', name: alert.labels.deployment, namespace });
  }
  if (alert.labels.node) {
    resources.push({ kind: 'Node', name: alert.labels.node });
  }

  const alertName = alert.labels.alertname ?? 'unknown';

  return {
    id: `prom-${alertName}-${labelsHash(alert.labels)}`,
    source: 'prometheus-alert',
    severity,
    status: alert.state === 'firing' ? 'active' : 'acknowledged',
    title: alertName,
    detail: alert.annotations.description ?? alert.annotations.summary ?? '',
    timestamp: ts,
    freshness: computeFreshness(ts, now),
    namespace,
    resources,
    category: alertName,
    autoFixable: false,
    correlationKey: resources.length > 0
      ? `${resources[0].kind}/${resources[0].name}/${namespace ?? '_'}`
      : `prom:${alertName}`,
    sourceRef: `prometheus:${alertName}:${labelsHash(alert.labels)}`,
    sourceData: alert as unknown as Record<string, unknown>,
  };
}

/** Map ErrorCategory to IncidentSeverity */
function errorCategoryToSeverity(category: ErrorCategory, statusCode: number): IncidentSeverity {
  if (statusCode >= 500 || category === 'server') return 'critical';
  if (category === 'permission' || category === 'quota') return 'warning';
  return 'info';
}

export function trackedErrorToIncident(
  err: TrackedError,
  now = Date.now(),
): IncidentItem {
  const resources: ResourceRef[] = [];
  if (err.resourceKind && err.resourceName) {
    resources.push({
      kind: err.resourceKind,
      name: err.resourceName,
      namespace: err.namespace,
    });
  }

  return {
    id: err.id,
    source: 'tracked-error',
    severity: errorCategoryToSeverity(err.category, err.statusCode),
    status: err.resolved ? 'resolved' : 'active',
    title: err.userMessage,
    detail: err.message,
    timestamp: err.timestamp,
    freshness: computeFreshness(err.timestamp, now),
    namespace: err.namespace,
    resources,
    category: err.category,
    autoFixable: false,
    correlationKey: resources.length > 0
      ? `${resources[0].kind}/${resources[0].name}/${err.namespace ?? '_'}`
      : `error:${err.id}`,
    sourceRef: `error:${err.id}`,
    sourceData: err as unknown as Record<string, unknown>,
  };
}

export function timelineEntryToIncident(
  entry: TimelineEntry,
  now = Date.now(),
): IncidentItem {
  const ts = new Date(entry.timestamp).getTime();
  return {
    id: entry.id,
    source: 'timeline-entry',
    severity: TIMELINE_SEVERITY_MAP[entry.severity] ?? 'info',
    status: 'active',
    title: entry.title,
    detail: entry.detail,
    timestamp: ts,
    freshness: computeFreshness(ts, now),
    namespace: entry.namespace ?? entry.resource?.namespace,
    resources: entry.resource
      ? [{ kind: entry.resource.kind, name: entry.resource.name, namespace: entry.resource.namespace }]
      : [],
    category: entry.category,
    autoFixable: false,
    correlationKey: entry.correlationKey ??
      (entry.resource
        ? `${entry.resource.kind}/${entry.resource.name}/${entry.resource.namespace ?? '_'}`
        : `timeline:${entry.id}`),
    sourceRef: `timeline:${entry.id}`,
    sourceData: entry as unknown as Record<string, unknown>,
  };
}

export function fleetAlertToIncident(
  alert: FleetAlert,
  now = Date.now(),
): IncidentItem {
  const ts = new Date(alert.activeAt).getTime();
  const severity = normalizeSeverity(alert.severity);

  // Extract resources from labels
  const resources: ResourceRef[] = [];
  if (alert.labels.pod) {
    resources.push({ kind: 'Pod', name: alert.labels.pod, namespace: alert.namespace });
  }
  if (alert.labels.deployment) {
    resources.push({ kind: 'Deployment', name: alert.labels.deployment, namespace: alert.namespace });
  }
  if (alert.labels.node) {
    resources.push({ kind: 'Node', name: alert.labels.node });
  }

  return {
    id: `fleet-${alert.clusterId}-${alert.alertName}-${ts}`,
    source: 'fleet-alert',
    severity,
    status: alert.state === 'firing' ? 'active' : 'acknowledged',
    title: `[${alert.clusterName}] ${alert.alertName}`,
    detail: alert.annotations.description ?? alert.annotations.summary ?? '',
    timestamp: ts,
    freshness: computeFreshness(ts, now),
    namespace: alert.namespace,
    resources,
    category: alert.alertName,
    autoFixable: false,
    correlationKey: `fleet:${alert.clusterId}:${alert.alertName}`,
    sourceRef: `fleet:${alert.clusterId}:${alert.alertName}`,
    clusterId: alert.clusterId,
    sourceData: alert as unknown as Record<string, unknown>,
  };
}
