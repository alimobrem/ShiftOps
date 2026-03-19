import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

describe('ReportTab (Pulse Report — 4-Zone Daily Briefing)', () => {
  const source = readSrc('pulse/ReportTab.tsx');

  describe('Zone 1: Heartbeat (Control Plane)', () => {
    it('renders risk score ring', () => {
      expect(source).toContain('RiskScoreRing');
      expect(source).toContain('<svg');
    });

    it('has four severity levels', () => {
      expect(source).toContain("'Healthy'");
      expect(source).toContain("'Caution'");
      expect(source).toContain("'At Risk'");
      expect(source).toContain("'Critical'");
    });

    it('has details popover for score breakdown', () => {
      expect(source).toContain('Score Breakdown');
      expect(source).toContain('showScoreDetails');
    });

    it('shows control plane operator status', () => {
      expect(source).toContain('controlPlaneOps');
      expect(source).toContain('kube-apiserver');
      expect(source).toContain('etcd');
      expect(source).toContain('authentication');
    });

    it('queries API server latency via PromQL', () => {
      expect(source).toContain('apiserver_request_duration_seconds_bucket');
      expect(source).toContain('API Latency (p99)');
    });

    it('queries etcd leader changes via PromQL', () => {
      expect(source).toContain('etcd_server_is_leader');
      expect(source).toContain('Etcd Leader Changes');
    });

    it('shows urgent certificates (<30d) in Zone 1', () => {
      expect(source).toContain('urgentCerts');
      expect(source).toContain('Certificates Expiring Soon');
    });

    it('shows degraded operators with names', () => {
      expect(source).toContain('degradedOperators');
      expect(source).toContain('degraded operator');
    });
  });

  describe('Zone 2: Bottleneck (Capacity)', () => {
    it('shows CPU and Memory sparklines', () => {
      expect(source).toContain('title="CPU"');
      expect(source).toContain('title="Memory"');
    });

    it('shows node count', () => {
      expect(source).toContain('readyNodes.length');
      expect(source).toContain('nodes.length');
    });

    it('shows pod count for user namespaces', () => {
      expect(source).toContain('runningPods.length');
      expect(source).toContain('userPods.length');
    });

    it('shows Network In and Disk I/O sparklines', () => {
      expect(source).toContain('title="Network In"');
      expect(source).toContain('title="Disk I/O"');
    });

    it('lists nodes under pressure', () => {
      expect(source).toContain('pressuredNodes');
      expect(source).toContain('Nodes Under Pressure');
      expect(source).toContain('DiskPressure');
      expect(source).toContain('MemoryPressure');
      expect(source).toContain('PIDPressure');
    });

    it('shows PVs over 85% used', () => {
      expect(source).toContain('pvOverloaded');
      expect(source).toContain('PVs Over 85% Used');
      expect(source).toContain('kubelet_volume_stats_used_bytes');
    });

    it('shows quota overages', () => {
      expect(source).toContain('quotaOverages');
      expect(source).toContain('Quota Overages');
      expect(source).toContain('resourcequotas');
    });
  });

  describe('Zone 3: Fire Alarm (Workload Anomalies)', () => {
    it('shows attention items with inline runbook steps', () => {
      expect(source).toContain('attentionItems');
      expect(source).toContain('Needs Attention');
      expect(source).toContain('steps');
    });

    it('includes CrashLoopBackOff investigation steps', () => {
      expect(source).toContain('CrashLoopBackOff');
      expect(source).toContain('Check pod logs for error messages');
    });

    it('includes ImagePullBackOff investigation steps', () => {
      expect(source).toContain('ImagePullBackOff');
      expect(source).toContain('Verify image name and tag are correct');
    });

    it('shows pending pods', () => {
      expect(source).toContain('pendingPods');
      expect(source).toContain('Pending Pod');
    });

    it('shows top restarting pods (>5 restarts)', () => {
      expect(source).toContain('topRestartingPods');
      expect(source).toContain('Top Restarting Pods');
      expect(source).toContain('restarts > 5');
    });

    it('shows all clear when no problems', () => {
      expect(source).toContain('All clear');
      expect(source).toContain('no issues detected');
    });

    it('links to relevant views', () => {
      expect(source).toContain('/admin?tab=operators');
      expect(source).toContain('/alerts');
      expect(source).toContain('/r/v1~pods/');
    });
  });

  describe('Zone 4: Roadmap (Plan Your Day)', () => {
    it('shows cluster update availability', () => {
      expect(source).toContain('updateAvailable');
      expect(source).toContain('Cluster Updates');
      expect(source).toContain('clusterversions/version');
    });

    it('shows recent events as clickable changes with source', () => {
      expect(source).toContain('recentChanges');
      expect(source).toContain('Recent Changes (1h)');
      expect(source).toContain('ev.source');
      expect(source).toContain('ev.path');
      expect(source).toContain('involvedObject');
    });

    it('has quick links to Security, Readiness, Certificates, Alerts', () => {
      expect(source).toContain('/security');
      expect(source).toContain('/admin?tab=readiness');
      expect(source).toContain('/admin?tab=certificates');
      expect(source).toContain('/alerts');
    });
  });

  describe('risk score computation', () => {
    it('weights critical alerts at 20 points each (max 40)', () => {
      expect(source).toContain('Math.min(40, criticalAlerts.length * 20)');
    });

    it('weights unhealthy nodes at 15 points each', () => {
      expect(source).toContain('unhealthyNodes.length * 15');
    });

    it('weights degraded operators at 10 points each', () => {
      expect(source).toContain('degradedOperators.length * 10');
    });

    it('caps total score at 100', () => {
      expect(source).toContain('Math.min(100,');
    });
  });

  describe('data sources', () => {
    it('receives nodes, pods, deployments, pvcs, operators as props', () => {
      expect(source).toContain('nodes: K8sResource[]');
      expect(source).toContain('allPods: K8sResource[]');
      expect(source).toContain('deployments: K8sResource[]');
      expect(source).toContain('pvcs: K8sResource[]');
      expect(source).toContain('operators: K8sResource[]');
    });

    it('fetches TLS secrets', () => {
      expect(source).toContain('kubernetes.io/tls');
    });

    it('uses Prometheus for firing alerts', () => {
      expect(source).toContain('ALERTS{alertstate="firing"}');
    });

    it('fetches ResourceQuotas', () => {
      expect(source).toContain('/api/v1/resourcequotas');
    });

    it('fetches ClusterVersion', () => {
      expect(source).toContain('clusterversions/version');
    });

    it('fetches recent events', () => {
      expect(source).toContain('/api/v1/events');
    });
  });

  describe('zone headers', () => {
    it('has 4 numbered zone headers', () => {
      expect(source).toContain('ZoneHeader');
      expect(source).toContain('Heartbeat');
      expect(source).toContain('Bottleneck');
      expect(source).toContain('Fire Alarm');
      expect(source).toContain('Roadmap');
    });
  });

  describe('integration', () => {
    it('is used in PulseView', () => {
      const pulse = readSrc('PulseView.tsx');
      expect(pulse).toContain('ReportTab');
    });
  });
});
