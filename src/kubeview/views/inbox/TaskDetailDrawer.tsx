import { useState, useEffect } from 'react';
import {
  Clock, User, Calendar, Tag, ArrowUpCircle, Bot, Loader2,
  ArrowRight, RotateCcw, Archive, Search, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { DrawerShell } from '../../components/primitives/DrawerShell';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { formatRelativeTime } from '../../engine/formatters';
import {
  escalateInboxItem,
  fetchInboxInvestigation,
  type InboxItem,
  type InvestigationReport,
} from '../../engine/inboxApi';
import { useInboxStore } from '../../store/inboxStore';
import { useAgentStore } from '../../store/agentStore';
import { useUIStore } from '../../store/uiStore';
import { InboxLifecycleStepper } from './InboxLifecycle';

function formatDueDate(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildInvestigatePrompt(item: InboxItem): string {
  const resources = item.resources.map((r) => `${r.kind}/${r.name}`).join(', ');
  const ns = item.namespace ? ` in namespace ${item.namespace}` : '';
  return `Investigate: ${item.title}${ns}. ${item.summary || ''} Resources: ${resources}`.trim();
}

function InvestigationCard({ report }: { report: InvestigationReport }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const confidencePct = Math.round(report.confidence * 100);

  return (
    <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
        <Search className="w-3.5 h-3.5" />
        Investigation Results
        <span className="ml-auto text-slate-500">{confidencePct}% confidence</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all"
          style={{ width: `${confidencePct}%` }}
        />
      </div>
      {report.summary && (
        <p className="text-sm text-slate-300">{report.summary}</p>
      )}
      {report.suspected_cause && (
        <div className="text-sm">
          <span className="text-slate-500">Suspected cause: </span>
          <span className="text-amber-300">{report.suspected_cause}</span>
        </div>
      )}
      {report.recommended_fix && (
        <div className="text-sm">
          <span className="text-slate-500">Recommended: </span>
          <span className="text-emerald-300">{report.recommended_fix}</span>
        </div>
      )}
      {report.evidence?.length > 0 && (
        <div>
          <button
            onClick={() => setEvidenceOpen(!evidenceOpen)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {evidenceOpen ? 'Hide' : 'Show'} evidence ({report.evidence.length})
          </button>
          {evidenceOpen && (
            <ul className="mt-1 space-y-1 text-xs text-slate-400">
              {report.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-slate-600 mt-0.5">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskDetailDrawer({
  item,
  onClose,
}: {
  item: InboxItem;
  onClose: () => void;
}) {
  const resolve = useInboxStore((s) => s.resolve);
  const claim = useInboxStore((s) => s.claim);
  const acknowledge = useInboxStore((s) => s.acknowledge);
  const dismiss = useInboxStore((s) => s.dismiss);
  const restore = useInboxStore((s) => s.restore);
  const refresh = useInboxStore((s) => s.refresh);
  const setSelectedItem = useInboxStore((s) => s.setSelectedItem);

  const [investigation, setInvestigation] = useState<InvestigationReport | null>(null);

  useEffect(() => {
    if (item.metadata?.investigation_id) {
      fetchInboxInvestigation(item.id).then(setInvestigation).catch(() => null);
    } else {
      setInvestigation(null);
    }
  }, [item.id, item.metadata?.investigation_id]);

  const triaged = !!item.metadata?.triaged;
  const triageAssessment = String(item.metadata?.triage_assessment || '');
  const triageAction = String(item.metadata?.triage_action || 'monitor');
  const triageUrgency = String(item.metadata?.triage_urgency || 'can-wait');
  const dismissReason = String(item.metadata?.dismiss_reason || '');

  const handleInvestigate = () => {
    useAgentStore.getState().connectAndSend(buildInvestigatePrompt(item));
    useUIStore.getState().expandAISidebar();
    useUIStore.getState().setAISidebarMode('chat');
    onClose();
  };

  const handleEscalate = async () => {
    try {
      const result = await escalateInboxItem(item.id);
      refresh();
      if (result.finding_id) setSelectedItem(result.finding_id);
    } catch { /* toast */ }
  };

  const handleAdvance = async (status: string) => {
    try {
      await fetch(`/api/agent/inbox/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      refresh();
    } catch { /* handled */ }
  };

  return (
    <DrawerShell title={item.title} onClose={onClose}>
      <div className="space-y-4 p-4">
        <InboxLifecycleStepper itemType={item.item_type} status={item.status} />

        {item.status === 'escalated' && !!item.metadata?.escalated_to && (
          <button
            onClick={() => setSelectedItem(String(item.metadata!.escalated_to))}
            className="w-full text-left rounded-lg border border-violet-800/50 bg-violet-950/30 px-3 py-2 text-sm text-violet-300 hover:bg-violet-900/30 transition-colors"
          >
            Escalated to finding — click to view →
          </button>
        )}

        {item.status === 'agent_cleared' && dismissReason && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Agent cleared this item
            </div>
            <p className="text-sm text-slate-300">{dismissReason}</p>
          </div>
        )}

        {item.status === 'agent_reviewing' && (
          <div className="rounded-lg border border-violet-800/50 bg-violet-950/30 p-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            <span className="text-sm text-violet-300">Agent is investigating this item...</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {item.namespace && (
            <Badge variant="outline">
              <Tag className="w-3 h-3 mr-1" />
              {item.namespace}
            </Badge>
          )}
        </div>

        {triaged && (
          <div className="rounded-lg border border-violet-800/50 bg-violet-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-violet-400">
              <Bot className="w-3.5 h-3.5" />
              AI Triage
            </div>
            {triageAssessment && (
              <p className="text-sm text-slate-300">{triageAssessment}</p>
            )}
            <div className="flex items-center gap-3 text-xs">
              <Badge variant={
                triageAction === 'investigate' ? 'warning' :
                triageAction === 'dismiss' ? 'info' : 'default'
              }>
                {triageAction}
              </Badge>
              <Badge variant={
                triageUrgency === 'immediate' ? 'error' :
                triageUrgency === 'soon' ? 'warning' : 'default'
              }>
                {triageUrgency}
              </Badge>
            </div>
          </div>
        )}

        {investigation && <InvestigationCard report={investigation} />}

        {item.summary && !triageAssessment && (
          <p className="text-sm text-slate-400 leading-relaxed">{item.summary}</p>
        )}

        <div className="space-y-2 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Created {formatRelativeTime(item.created_at * 1000)}</span>
          </div>
          {item.due_date && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Due {formatDueDate(item.due_date)}</span>
            </div>
          )}
          {item.claimed_by && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Claimed by {item.claimed_by}</span>
            </div>
          )}
        </div>

        {item.resources.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase mb-2">Resources</h3>
            <div className="space-y-1">
              {item.resources.map((r, i) => (
                <div key={i} className="text-sm text-slate-400">
                  {r.kind}/{r.name}
                  {r.namespace && <span className="text-slate-600 ml-1">({r.namespace})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forward buttons — user can always move forward */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800">
          {item.status === 'new' && (
            <Button size="sm" onClick={handleInvestigate}>
              <Bot className="w-4 h-4 mr-1" />
              Investigate with AI
            </Button>
          )}

          {item.status === 'agent_cleared' && (
            <>
              <Button size="sm" onClick={() => restore(item.id)}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Restore to Inbox
              </Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss(item.id)}>
                <Archive className="w-4 h-4 mr-1" />
                Archive
              </Button>
            </>
          )}

          {item.status === 'acknowledged' && (
            <>
              <Button size="sm" onClick={handleInvestigate}>
                <Bot className="w-4 h-4 mr-1" />
                Investigate with AI
              </Button>
              {item.item_type === 'task' && (
                <Button size="sm" variant="ghost" onClick={() => handleAdvance('in_progress')}>
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Start Working
                </Button>
              )}
              {item.item_type === 'assessment' && (
                <Button size="sm" variant="ghost" onClick={handleEscalate}>
                  <ArrowUpCircle className="w-4 h-4 mr-1" />
                  Escalate
                </Button>
              )}
            </>
          )}

          {item.status === 'investigating' && (
            <Button size="sm" onClick={() => handleAdvance('action_taken')}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Mark Action Taken
            </Button>
          )}

          {item.status === 'action_taken' && (
            <Button size="sm" onClick={() => handleAdvance('verifying')}>
              <ArrowRight className="w-4 h-4 mr-1" />
              Mark Verifying
            </Button>
          )}

          {item.status === 'verifying' && (
            <>
              <Button size="sm" onClick={() => resolve(item.id)}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Mark Resolved
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleAdvance('investigating')}>
                Re-investigate
              </Button>
            </>
          )}

          {item.status === 'in_progress' && (
            <Button size="sm" onClick={() => resolve(item.id)}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Mark Done
            </Button>
          )}

          {item.status === 'resolved' && (
            <Button size="sm" variant="ghost" onClick={() => dismiss(item.id)}>
              <Archive className="w-4 h-4 mr-1" />
              Archive
            </Button>
          )}

          {!item.claimed_by && !['agent_cleared', 'agent_reviewing', 'resolved', 'archived'].includes(item.status) && (
            <Button size="sm" variant="ghost" onClick={() => claim(item.id)}>Claim</Button>
          )}
        </div>
      </div>
    </DrawerShell>
  );
}
