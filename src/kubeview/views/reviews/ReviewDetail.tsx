import React from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewItem } from '../../store/reviewStore';
import { useReviewStore } from '../../store/reviewStore';
import { DiffViewer } from './DiffViewer';

interface ReviewDetailProps {
  review: ReviewItem;
}

export function ReviewDetail({ review }: ReviewDetailProps) {
  const approveReview = useReviewStore((s) => s.approveReview);
  const rejectReview = useReviewStore((s) => s.rejectReview);

  const isPending = review.status === 'pending' || review.status === 'changes_requested';

  return (
    <div className="space-y-4 pt-3 border-t border-slate-800">
      <p className="text-sm text-slate-300 leading-relaxed">{review.description}</p>

      {review.diff.fields.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Changed Fields</h4>
          <div className="space-y-1.5">
            {review.diff.fields.map((field) => (
              <div key={field.key} className="flex items-center gap-2 text-xs">
                <code className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{field.key}</code>
                <span className="text-red-400 line-through">{field.before}</span>
                <span className="text-slate-600">-&gt;</span>
                <span className="text-emerald-400">{field.after}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <DiffViewer diff={review.diff} />

      <div className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3 text-sm',
        review.riskLevel === 'critical'
          ? 'border-red-500/30 bg-red-950/20 text-red-300'
          : review.riskLevel === 'high'
            ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
            : 'border-slate-700 bg-slate-900/50 text-slate-300',
      )}>
        {review.riskLevel === 'critical' || review.riskLevel === 'high' ? (
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        ) : (
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
        )}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">Business Impact</span>
          {review.businessImpact}
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => approveReview(review.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={() => rejectReview(review.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
          >
            <X className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}

      {!isPending && review.reviewedAt && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={cn(
            'px-2 py-0.5 rounded-full font-medium',
            review.status === 'approved' && 'bg-emerald-500/20 text-emerald-400',
            review.status === 'rejected' && 'bg-red-500/20 text-red-400',
          )}>
            {review.status === 'approved' ? 'Approved' : 'Rejected'}
          </span>
          <span>{new Date(review.reviewedAt).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
