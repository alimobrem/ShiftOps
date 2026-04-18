import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMonitorStore } from '../store/monitorStore';
import type {
  Finding, ActionReport, InvestigationReport, VerificationReport,
} from '../engine/monitorClient';

export interface ImpactAnalysis {
  finding_id: string;
  affected_resource: { kind: string; name: string; namespace: string } | null;
  blast_radius: Array<{ id: string; kind: string; name: string; namespace: string }>;
  upstream_dependencies: Array<{ id: string; kind: string; name: string; namespace: string }>;
  affected_pods: number;
  scope: string;
  risk_level: string;
}

export interface LearningArtifacts {
  finding_id: string;
  scaffolded_skill: { name: string; path: string } | null;
  scaffolded_plan: { name: string; incident_type: string; phases: number } | null;
  scaffolded_eval: { scenario_id: string; tool_calls: number } | null;
  learned_runbook: { name: string; success_count: number; tool_sequence: string[] } | null;
  detected_patterns: Array<{ type: string; description: string; frequency: number }>;
  confidence_delta: { before: number; after: number; delta: number } | null;
  weight_impact: { channel: string; old_weight: number; new_weight: number } | null;
}

export interface Postmortem {
  id: string;
  incident_type: string;
  plan_id: string;
  timeline: string;
  root_cause: string;
  contributing_factors: string[];
  blast_radius: string[];
  actions_taken: string[];
  prevention: string[];
  metrics_impact: string;
  confidence: number;
  generated_at: number;
}

export interface IncidentLifecycle {
  detection: Finding | null;
  impact: ImpactAnalysis | null;
  investigation: InvestigationReport | null;
  action: ActionReport | null;
  verification: VerificationReport | null;
  postmortem: Postmortem | null;
  learning: LearningArtifacts | null;
  isLoading: boolean;
}

async function fetchImpact(findingId: string): Promise<ImpactAnalysis | null> {
  const res = await fetch(`/api/agent/incidents/${findingId}/impact`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchLearning(findingId: string): Promise<LearningArtifacts | null> {
  const res = await fetch(`/api/agent/incidents/${findingId}/learning`);
  if (!res.ok) return null;
  return res.json();
}

async function fetchPostmortems(): Promise<Postmortem[]> {
  const res = await fetch('/api/agent/postmortems');
  if (!res.ok) return [];
  const data = await res.json();
  return data.postmortems ?? [];
}

export function useIncidentLifecycle(findingId: string): IncidentLifecycle {
  const findings = useMonitorStore((s) => s.findings);
  const investigations = useMonitorStore((s) => s.investigations);
  const recentActions = useMonitorStore((s) => s.recentActions);
  const pendingActions = useMonitorStore((s) => s.pendingActions);
  const verifications = useMonitorStore((s) => s.verifications);

  const detection = useMemo(
    () => findings.find((f) => f.id === findingId) ?? null,
    [findings, findingId],
  );

  const investigation = useMemo(
    () => [...investigations].reverse().find((r) => r.findingId === findingId) ?? null,
    [investigations, findingId],
  );

  const action = useMemo(() => {
    const pending = pendingActions.find((a) => a.findingId === findingId);
    if (pending) return pending;
    return [...recentActions].reverse().find((a) => a.findingId === findingId) ?? null;
  }, [pendingActions, recentActions, findingId]);

  const verification = useMemo(
    () => [...verifications].reverse().find((v) => v.findingId === findingId) ?? null,
    [verifications, findingId],
  );

  const { data: impact, isLoading: impactLoading } = useQuery({
    queryKey: ['incident-impact', findingId],
    queryFn: () => fetchImpact(findingId),
    enabled: !!findingId,
    staleTime: 60_000,
  });

  const { data: learning, isLoading: learningLoading } = useQuery({
    queryKey: ['incident-learning', findingId],
    queryFn: () => fetchLearning(findingId),
    enabled: !!findingId,
    staleTime: 60_000,
  });

  const { data: allPostmortems = [] } = useQuery({
    queryKey: ['postmortems'],
    queryFn: fetchPostmortems,
    staleTime: 60_000,
  });

  const postmortem = useMemo(() => {
    if (!detection) return null;
    return allPostmortems.find((pm) =>
      pm.plan_id === detection.planName ||
      pm.incident_type === detection.category,
    ) ?? null;
  }, [allPostmortems, detection]);

  return {
    detection,
    impact: impact ?? null,
    investigation,
    action,
    verification,
    postmortem,
    learning: learning ?? null,
    isLoading: impactLoading || learningLoading,
  };
}
