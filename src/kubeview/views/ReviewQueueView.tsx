import React, { useMemo } from 'react';
import { GitPullRequest, Filter, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReviewStore, useAllReviews } from '../store/reviewStore';
import type { ReviewFilters, ReviewItem, RiskLevel } from '../store/reviewStore';
import { useMonitorStore } from '../store/monitorStore';
import { ReviewCard } from './reviews/ReviewCard';
import { SectionHeader } from '../components/primitives/SectionHeader';
import { SearchInput } from '../components/primitives/SearchInput';
import { EmptyState } from '../components/primitives/EmptyState';

const TABS = [
  { key: 'pending' as const, label: 'Pending' },
  { key: 'approved' as const, label: 'Approved' },
  { key: 'rejected' as const, label: 'Rejected' },
];

const RISK_OPTIONS: Array<{ value: RiskLevel | ''; label: string }> = [
  { value: '', label: 'All risks' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function applyFilters(reviews: ReviewItem[], filters: ReviewFilters, tab: string): ReviewItem[] {
  return reviews.filter((r) => {
    // Tab filter
    if (tab === 'pending' && r.status !== 'pending' && r.status !== 'changes_requested') return false;
    if (tab === 'approved' && r.status !== 'approved') return false;
    if (tab === 'rejected' && r.status !== 'rejected') return false;

    // Risk filter
    if (filters.riskLevel && r.riskLevel !== filters.riskLevel) return false;

    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const searchable = `${r.title} ${r.resourceName} ${r.namespace} ${r.resourceType}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    return true;
  });
}

export default function ReviewQueueView() {
  const reviews = useAllReviews();
  const activeTab = useReviewStore((s) => s.activeTab);
  const filters = useReviewStore((s) => s.filters);
  const setActiveTab = useReviewStore((s) => s.setActiveTab);
  const setFilter = useReviewStore((s) => s.setFilter);
  const connected = useMonitorStore((s) => s.connected);

  const filtered = useMemo(
    () => applyFilters(reviews, filters, activeTab),
    [reviews, filters, activeTab],
  );

  const tabCounts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0;
    for (const r of reviews) {
      if (r.status === 'pending' || r.status === 'changes_requested') pending++;
      else if (r.status === 'approved') approved++;
      else if (r.status === 'rejected') rejected++;
    }
    return { pending, approved, rejected };
  }, [reviews]);

  return (
    <div className="h-full overflow-auto bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <SectionHeader
            icon={<GitPullRequest className="w-6 h-6 text-violet-400" />}
            title="Review Queue"
            subtitle="AI-proposed infrastructure changes awaiting your review"
          />
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                connected ? 'bg-green-400 animate-pulse' : 'bg-slate-500',
              )}
            />
            <span className={cn('text-sm font-medium', connected ? 'text-green-300' : 'text-slate-400')}>
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>


        <div className="flex items-center gap-1 border-b border-slate-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              )}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={cn(
                  'ml-1.5 px-1.5 py-0.5 rounded-full text-xs',
                  activeTab === tab.key ? 'bg-violet-500/20 text-violet-400' : 'bg-slate-800 text-slate-500',
                )}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <SearchInput
            value={filters.search || ''}
            onChange={(v) => setFilter({ search: v || undefined })}
            placeholder="Search reviews..."
            className="flex-1"
          />

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <select
              value={filters.riskLevel || ''}
              onChange={(e) => setFilter({ riskLevel: (e.target.value || undefined) as RiskLevel | undefined })}
              className="pl-8 pr-6 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300 appearance-none focus:outline-none focus:border-slate-600"
            >
              {RISK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox className="w-10 h-10" />}
            title="No reviews found"
            description={
              activeTab === 'pending'
                ? connected
                  ? 'All caught up — no changes awaiting review.'
                  : 'Connect to the agent to see real-time proposed changes.'
                : `No ${activeTab} reviews match the current filters.`
            }
          />
        )}
      </div>
    </div>
  );
}
