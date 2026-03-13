import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal, ModalVariant, ModalHeader, ModalBody, ModalFooter,
  Button, Label, Progress, ProgressVariant,
} from '@patternfly/react-core';
import {
  CheckCircleIcon, ExclamationCircleIcon, SpinnerIcon, InfoCircleIcon,
} from '@patternfly/react-icons';

const BASE = '/api/kubernetes';

interface LogEntry {
  time: Date;
  message: string;
  status: 'info' | 'success' | 'error' | 'pending';
}

interface HelmInstallProgressProps {
  releaseName: string;
  namespace: string;
  chartName: string;
  chartUrl: string;
  repoUrl: string;
  skipSchemaValidation?: boolean;
  valuesYaml?: string;
  onClose: () => void;
}

export default function HelmInstallProgress({
  releaseName,
  namespace,
  chartName,
  chartUrl,
  repoUrl,
  skipSchemaValidation = false,
  valuesYaml,
  onClose,
}: HelmInstallProgressProps) {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [phase, setPhase] = useState<'installing' | 'watching' | 'done' | 'failed' | 'cli'>('installing');
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());
  const jobName = useRef(`helm-install-${releaseName}-${Date.now().toString(36).slice(-4)}`);
  const installStarted = useRef(false);

  const addLog = useCallback((message: string, status: LogEntry['status'] = 'info') => {
    setLogs((prev) => [...prev, { time: new Date(), message, status }]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Step 1: Create a ServiceAccount + RoleBinding + Job to run helm install
  useEffect(() => {
    let cancelled = false;

    async function attemptInstall() {
      // Prevent React strict mode double-execution
      if (installStarted.current) return;
      installStarted.current = true;

      addLog(`Installing ${chartName} as "${releaseName}" in namespace ${namespace}...`, 'pending');
      setProgress(5);

      if (!chartUrl && !repoUrl) {
        addLog('No chart URL available — use CLI to install', 'info');
        setPhase('cli');
        return;
      }

      addLog(`Chart: ${chartUrl || `${repoUrl} / ${chartName}`}`, 'info');
      setProgress(10);

      // Step 1a: Ensure namespace exists
      try {
        const nsRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}`);
        if (nsRes.ok) {
          addLog(`Namespace "${namespace}" exists`, 'success');
        } else {
          addLog(`Creating namespace "${namespace}"...`, 'pending');
          const createNs = await fetch(`${BASE}/api/v1/namespaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }),
          });
          if (createNs.ok) {
            addLog(`Namespace "${namespace}" created`, 'success');
          } else {
            addLog(`Could not create namespace: ${createNs.status}`, 'error');
          }
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      setProgress(15);

      // Step 1b: Create a ServiceAccount for the install job
      const saName = `helm-installer-${releaseName}`;
      try {
        addLog('Creating service account for install job...', 'pending');
        const saRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiVersion: 'v1', kind: 'ServiceAccount',
            metadata: { name: saName, namespace, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
          }),
        });
        if (saRes.ok || saRes.status === 409) {
          addLog('Service account ready', 'success');
        } else {
          addLog(`Service account creation: ${saRes.status}`, 'info');
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      setProgress(20);

      // Step 1c: Create ClusterRoleBinding for the SA (cluster-admin)
      // Many charts create cluster-scoped resources (CRDs, ClusterRoles, etc.)
      const crbName = `helm-installer-${releaseName}-${namespace}`;
      try {
        addLog('Setting up permissions (cluster-admin)...', 'pending');
        const crbRes = await fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRoleBinding',
            metadata: { name: crbName, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
            roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
            subjects: [{ kind: 'ServiceAccount', name: saName, namespace }],
          }),
        });
        if (crbRes.ok || crbRes.status === 409) {
          addLog('Cluster permissions configured', 'success');
        } else {
          // Fall back to namespace-scoped admin
          addLog('ClusterRoleBinding denied, trying namespace-scoped admin...', 'info');
          const rbRes = await fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/namespaces/${encodeURIComponent(namespace)}/rolebindings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding',
              metadata: { name: `helm-installer-${releaseName}`, namespace, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
              roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'admin' },
              subjects: [{ kind: 'ServiceAccount', name: saName, namespace }],
            }),
          });
          if (rbRes.ok || rbRes.status === 409) {
            addLog('Namespace admin permissions configured (charts with cluster resources may fail)', 'info');
          }
        }
      } catch { /* ignore */ }
      if (cancelled) return;
      setProgress(30);

      // Step 1d: Create ConfigMap with custom values if provided
      const hasCustomValues = valuesYaml && valuesYaml.trim().length > 0;
      const valuesConfigMapName = `helm-values-${releaseName}`;
      if (hasCustomValues) {
        try {
          addLog('Creating values ConfigMap...', 'pending');
          const cmRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiVersion: 'v1', kind: 'ConfigMap',
              metadata: { name: valuesConfigMapName, namespace, labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
              data: { 'values.yaml': valuesYaml },
            }),
          });
          if (cmRes.ok || cmRes.status === 409) {
            addLog('Custom values ready', 'success');
          } else {
            addLog(`Values ConfigMap creation: ${cmRes.status}`, 'info');
          }
        } catch { /* ignore */ }
      }
      if (cancelled) return;

      // Step 1e: Create the install Job
      // Helm has NO flag to skip values.schema.json validation.
      // When skipSchemaValidation is set, we download the chart, strip schema files, then install.
      const valuesFlag = hasCustomValues ? ' -f /values/values.yaml' : '';
      let helmCmd: string;
      if (skipSchemaValidation) {
        const pullCmd = chartUrl
          ? `helm pull '${chartUrl}' --untar --untardir /tmp/chart`
          : `helm repo add temprepo '${repoUrl}' && helm pull temprepo/${chartName} --untar --untardir /tmp/chart`;
        helmCmd = [
          `set -ex`,
          pullCmd,
          `ls /tmp/chart/`,
          `find /tmp/chart -name 'values.schema.json' -type f -print -delete`,
          `find /tmp/chart -name '*.schema.json' -type f -print -delete`,
          `CHART_DIR=$(find /tmp/chart -maxdepth 1 -mindepth 1 -type d -exec test -f '{}/Chart.yaml' \\; -print | head -1)`,
          `echo "Installing from $CHART_DIR"`,
          `helm install ${releaseName} "$CHART_DIR" -n ${namespace} --wait --timeout 300s --disable-openapi-validation${valuesFlag}`,
        ].join(' && ');
      } else {
        helmCmd = chartUrl
          ? `helm install ${releaseName} '${chartUrl}' -n ${namespace} --wait --timeout 300s${valuesFlag}`
          : `helm repo add temprepo '${repoUrl}' && helm install ${releaseName} temprepo/${chartName} -n ${namespace} --wait --timeout 300s${valuesFlag}`;
      }

      addLog(`Command: ${helmCmd}`, 'info');

      try {
        addLog('Creating install job...', 'pending');
        const jobRes = await fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiVersion: 'batch/v1', kind: 'Job',
            metadata: {
              name: jobName.current,
              namespace,
              labels: {
                'app.kubernetes.io/managed-by': 'helm-ui-installer',
                'helm-release': releaseName,
              },
            },
            spec: {
              backoffLimit: 0,
              ttlSecondsAfterFinished: 300,
              template: {
                metadata: { labels: { 'app.kubernetes.io/managed-by': 'helm-ui-installer' } },
                spec: {
                  serviceAccountName: saName,
                  restartPolicy: 'Never',
                  containers: [{
                    name: 'helm',
                    image: 'alpine/helm:3.16.3',
                    command: ['sh', '-c', helmCmd],
                    env: skipSchemaValidation ? [
                      { name: 'HELM_SCHEMA_VALIDATION', value: 'false' },
                    ] : [],
                    ...(hasCustomValues ? {
                      volumeMounts: [{ name: 'values', mountPath: '/values', readOnly: true }],
                    } : {}),
                  }],
                  ...(hasCustomValues ? {
                    volumes: [{ name: 'values', configMap: { name: valuesConfigMapName } }],
                  } : {}),
                },
              },
            },
          }),
        });

        if (jobRes.ok) {
          addLog('Install job created', 'success');
          setProgress(40);
          if (!cancelled) {
            setPhase('watching');
            addLog('Watching job progress...', 'pending');
          }
          return;
        }

        const errText = await jobRes.text();
        addLog(`Failed to create job: ${errText.slice(0, 200)}`, 'error');
        addLog('Falling back to CLI instructions', 'info');
        if (!cancelled) setPhase('cli');
      } catch (err) {
        addLog(`Job creation error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        if (!cancelled) setPhase('cli');
      }
    }

    attemptInstall();
    return () => { cancelled = true; };
  }, [releaseName, namespace, chartName, chartUrl, repoUrl, addLog]);

  // Clean up install artifacts (SA, CRB, Job, ConfigMap)
  const cleanupArtifacts = useCallback(async () => {
    const saName = `helm-installer-${releaseName}`;
    const crbName = `helm-installer-${releaseName}-${namespace}`;
    const valuesConfigMapName = `helm-values-${releaseName}`;
    addLog('Cleaning up install artifacts...', 'pending');
    const delOpts = { method: 'DELETE' as const };
    await Promise.allSettled([
      fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/serviceaccounts/${saName}`, delOpts),
      fetch(`${BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${crbName}`, delOpts),
      fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${jobName.current}?propagationPolicy=Background`, delOpts),
      fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/configmaps/${valuesConfigMapName}`, delOpts),
    ]);
    addLog('Install artifacts cleaned up', 'success');
  }, [releaseName, namespace, addLog]);

  // Step 2: Watch the Job and related resources
  useEffect(() => {
    if (phase !== 'watching') return;

    let tick = 0;
    const maxTicks = 120; // 120 * 3s = 6 min max (longer than helm --timeout 300s)

    pollRef.current = setInterval(async () => {
      tick++;
      if (tick > maxTicks) {
        addLog('Timed out watching. Fetching final logs...', 'info');
        await fetchJobLogs();
        addLog('Check Helm Releases page for status.', 'info');
        setPhase('done');
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }

      // Check Job status
      try {
        const res = await fetch(`${BASE}/apis/batch/v1/namespaces/${encodeURIComponent(namespace)}/jobs/${jobName.current}`);
        if (res.ok) {
          const job = await res.json() as Record<string, unknown>;
          const status = (job['status'] ?? {}) as Record<string, unknown>;
          const conditions = (status['conditions'] ?? []) as Record<string, unknown>[];
          const succeeded = Number(status['succeeded'] ?? 0);
          const failed = Number(status['failed'] ?? 0);
          const active = Number(status['active'] ?? 0);

          if (succeeded > 0) {
            addLog('Install job completed successfully', 'success');
            setProgress(80);
            // Now check for the actual release
          } else if (failed > 0) {
            const failReason = conditions.find((c) => String(c['type']) === 'Failed');
            addLog(`Install job failed: ${String(failReason?.['message'] ?? 'see job logs')}`, 'error');
            await fetchJobLogs();
            await cleanupArtifacts();
            setPhase('failed');
            if (pollRef.current) clearInterval(pollRef.current);
            return;
          } else if (active > 0) {
            if (tick % 3 === 0) addLog('Install job running...', 'pending');
            // Try to stream live logs from the running pod
            if (tick % 5 === 0) {
              try {
                const podRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=job-name=${jobName.current}`);
                if (podRes.ok) {
                  const podData = await podRes.json() as { items: Record<string, unknown>[] };
                  const pod = (podData.items ?? [])[0];
                  if (pod) {
                    const podName = String(((pod)['metadata'] as Record<string, unknown>)?.['name'] ?? '');
                    const logRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${podName}/log?tailLines=5&sinceSeconds=15`);
                    if (logRes.ok) {
                      const logText = await logRes.text();
                      for (const line of logText.trim().split('\n').filter(Boolean).slice(-3)) {
                        const key = line.slice(0, 50);
                        if (!logs.some((l) => l.message.includes(key.slice(0, 30)))) {
                          addLog(`[log] ${line.slice(0, 150)}`, 'info');
                        }
                      }
                    }
                  }
                }
              } catch { /* ignore */ }
            }
            setProgress(40 + Math.min(30, tick));
          }
        }
      } catch { /* ignore */ }

      // Check for Helm release secret
      try {
        const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/secrets?labelSelector=name=${encodeURIComponent(releaseName)},owner=helm`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          const helmSecrets = (data.items ?? []).filter((s) => String(s['type']) === 'helm.sh/release.v1');
          if (helmSecrets.length > 0) {
            const latest = helmSecrets[helmSecrets.length - 1];
            const labels = ((latest['metadata'] ?? {}) as Record<string, unknown>)['labels'] as Record<string, string> | undefined;
            const releaseStatus = labels?.['status'] ?? 'unknown';
            if (releaseStatus === 'deployed') {
              addLog(`Helm release "${releaseName}": deployed`, 'success');
              setProgress(90);
            } else if (releaseStatus === 'failed') {
              addLog(`Helm release "${releaseName}": failed`, 'error');
              await fetchJobLogs();
              await cleanupArtifacts();
              setPhase('failed');
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }
          }
        }
      } catch { /* ignore */ }

      // Check pods created by the release
      try {
        const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=app.kubernetes.io/instance=${encodeURIComponent(releaseName)}`);
        if (res.ok) {
          const data = await res.json() as { items: Record<string, unknown>[] };
          const pods = data.items ?? [];
          if (pods.length > 0 && tick % 2 === 0) {
            const summary = pods.map((p) => {
              const meta = (p['metadata'] ?? {}) as Record<string, unknown>;
              const st = (p['status'] ?? {}) as Record<string, unknown>;
              const podName = String(meta['name'] ?? '');
              return `${podName.length > 35 ? podName.slice(0, 32) + '...' : podName}: ${String(st['phase'] ?? '?')}`;
            });
            addLog(`Pods (${pods.length}): ${summary.join(', ')}`, 'info');

            const allRunning = pods.every((p) => String(((p)['status'] as Record<string, unknown>)?.['phase']) === 'Running');
            if (allRunning && pods.length > 0) {
              addLog(`All ${pods.length} pod${pods.length > 1 ? 's' : ''} running`, 'success');
              setProgress(100);
              setPhase('done');
              if (pollRef.current) clearInterval(pollRef.current);
              return;
            }
          }
        }
      } catch { /* ignore */ }

      // Check events
      if (tick % 4 === 0) {
        try {
          const res = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/events?limit=5`);
          if (res.ok) {
            const data = await res.json() as { items: Record<string, unknown>[] };
            const recent = (data.items ?? []).filter((e) => {
              const ts = String(((e)['metadata'] as Record<string, unknown>)?.['creationTimestamp'] ?? '');
              return new Date(ts).getTime() > startTime.current;
            });
            for (const evt of recent.slice(-2)) {
              const reason = String(evt['reason'] ?? '');
              const msg = String(evt['message'] ?? '');
              const type = String(evt['type'] ?? '');
              const shortMsg = msg.slice(0, 100);
              // Deduplicate
              const key = `${reason}:${shortMsg.slice(0, 40)}`;
              if (!logs.some((l) => l.message.includes(key.slice(0, 30)))) {
                addLog(`[Event] ${reason}: ${shortMsg}`, type === 'Warning' ? 'error' : 'info');
              }
            }
          }
        } catch { /* ignore */ }
      }
    }, 3000);

    async function fetchJobLogs(retries = 3) {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const podRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods?labelSelector=job-name=${jobName.current}`);
          if (!podRes.ok) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          const podData = await podRes.json() as { items: Record<string, unknown>[] };
          const pod = (podData.items ?? [])[0];
          if (!pod) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          const podName = String(((pod)['metadata'] as Record<string, unknown>)?.['name'] ?? '');
          const podPhase = String(((pod)['status'] as Record<string, unknown>)?.['phase'] ?? '');
          // Wait for pod to finish if still running
          if (podPhase === 'Pending' || podPhase === 'Running') {
            addLog(`Install pod ${podPhase.toLowerCase()}, waiting for logs...`, 'pending');
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          const logRes = await fetch(`${BASE}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${podName}/log?tailLines=50`);
          if (!logRes.ok) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          const logText = await logRes.text();
          if (logText.trim()) {
            for (const line of logText.trim().split('\n').slice(-30)) {
              addLog(`[log] ${line}`, line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') ? 'error' : 'info');
            }
            return; // Got logs, done
          }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      addLog('Could not fetch install logs. Check pod logs manually.', 'info');
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, releaseName, namespace, addLog, cleanupArtifacts]);

  const statusIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'success': return <CheckCircleIcon style={{ color: '#3e8635', flexShrink: 0 }} />;
      case 'error': return <ExclamationCircleIcon style={{ color: '#c9190b', flexShrink: 0 }} />;
      case 'pending': return <SpinnerIcon style={{ color: '#0066cc', flexShrink: 0, animation: 'helm-spin 1s linear infinite' }} />;
      default: return <InfoCircleIcon style={{ color: '#6a6e73', flexShrink: 0 }} />;
    }
  };

  const progressVariant = phase === 'failed' ? ProgressVariant.danger
    : phase === 'done' ? ProgressVariant.success
    : undefined;

  return (
    <Modal variant={ModalVariant.medium} isOpen onClose={onClose}>
      <ModalHeader title={`Installing ${chartName}`} />
      <ModalBody>
        <Progress
          value={progress}
          title={
            phase === 'done' ? 'Complete' :
            phase === 'failed' ? 'Failed' :
            phase === 'cli' ? 'Manual install required' :
            phase === 'watching' ? 'Watching resources...' :
            'Setting up install...'
          }
          variant={progressVariant}
          style={{ marginBottom: 16 }}
        />

        <div style={{
          background: 'var(--modern-bg)',
          border: '1px solid var(--modern-border)',
          borderRadius: 8,
          padding: 12,
          maxHeight: 350,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: 1.8,
        }}>
          {logs.map((entry, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ flexShrink: 0, width: 16, paddingTop: 2 }}>{statusIcon(entry.status)}</span>
              <span style={{ color: 'var(--os-text-muted, #8a8d90)', flexShrink: 0 }}>
                {entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ color: entry.status === 'error' ? '#c9190b' : entry.status === 'success' ? '#3e8635' : 'var(--modern-text)' }}>
                {entry.message}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {phase === 'cli' && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 6, background: 'var(--modern-bg)', border: '1px solid var(--modern-border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Install via CLI:</div>
            <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {skipSchemaValidation
                ? `helm pull --repo ${repoUrl} ${chartName} --untar --untardir /tmp/chart && find /tmp/chart -name 'values.schema.json' -delete && helm install ${releaseName} /tmp/chart/*/ -n ${namespace}`
                : `helm install ${releaseName} --repo ${repoUrl} ${chartName} -n ${namespace}`}
            </code>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {(phase === 'done' || phase === 'failed') && (
          <Button variant="primary" onClick={() => { onClose(); navigate('/helm/releases'); }}>
            View Releases
          </Button>
        )}
        <Button variant={phase === 'done' || phase === 'failed' ? 'link' : 'secondary'} onClick={onClose}>
          {phase === 'installing' || phase === 'watching' ? 'Run in Background' : 'Close'}
        </Button>
      </ModalFooter>

      <style>{`
        @keyframes helm-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Modal>
  );
}
