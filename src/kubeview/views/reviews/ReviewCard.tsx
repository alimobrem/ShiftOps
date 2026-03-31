import React from 'react';
import { Bot, Shield, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewItem, RiskLevel } from '../../store/reviewStore';
import { useReviewStore } from '../../store/reviewStore';
import { formatAge } from '../../engine/dateUtils';
import { ReviewDetail } from './ReviewDetail';

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Low' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Medium' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'High' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Critical' },
};

function AgentIcon({ icon }: { icon: string }) {
  if (icon === 'shield') return <Shield className="w-4 h-4 text-violet-400" />;
  return <Bot className="w-4 h-4 text-blue-400" />;
}

interface ReviewCardProps {
  review: ReviewItem;
}

export function ReviewCard({ review }: ReviewCardProps) {
  const expandedId = useReviewStore((s) => s.expandedId);
  const setExpanded = useReviewStore((s) => s.setExpanded);
  const isExpanded = expandedId === review.id;
  const risk = RISK_STYLES[review.riskLevel];

  return (
    <div
      className={cn(
        'rounded-xl border bg-slate-900/80 transition-all',
        isExpanded ? 'border-slate-600' : 'border-slate-800 hover:border-slate-700',
      )}
    >
      <button
        onClick={() => setExpanded(isExpanded ? null : review.id)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={isExpanded}
      >
        <span className="text-slate-500 shrink-0" aria-hidden="true">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', risk.bg, risk.text)}>
          {risk.label}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-100 truncate">{review.title}</div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
            <span>{review.resourceType}/{review.resourceName}</span>
            <span className="text-slate-700">|</span>
            <span>{review.namespace}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-xs text-slate-500">
          <AgentIcon icon={review.agentIcon} />
          <span className="hidden sm:inline">{review.agentName}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 text-xs text-slate-600">
          <Clock className="w-3 h-3" />
          <span>{formatAge(new Date(review.createdAt))}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <ReviewDetail review={review} />
        </div>
      )}
    </div>
  );
}
