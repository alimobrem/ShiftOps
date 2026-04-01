// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

const mockSetActiveTab = vi.fn();
const mockSetFilter = vi.fn();

vi.mock('../../store/reviewStore', () => ({
  useAllReviews: () => [],
  useReviewStore: (selector: any) => {
    const state = {
      activeTab: 'pending',
      filters: { search: '', riskLevel: undefined },
      setActiveTab: mockSetActiveTab,
      setFilter: mockSetFilter,
    };
    return selector(state);
  },
}));

vi.mock('../../store/monitorStore', () => ({
  useMonitorStore: (selector: any) => {
    const state = { connected: false };
    return selector(state);
  },
}));

vi.mock('../reviews/ReviewCard', () => ({
  ReviewCard: ({ review }: { review: any }) => <div data-testid="review-card">{review.title}</div>,
}));

vi.mock('../../components/primitives/SectionHeader', () => ({
  SectionHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div data-testid="section-header">
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
}));

vi.mock('../../components/primitives/SearchInput', () => ({
  SearchInput: ({ placeholder }: { placeholder: string }) => (
    <input data-testid="search-input" placeholder={placeholder} readOnly />
  ),
}));

vi.mock('../../components/primitives/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));

import ReviewQueueView from '../ReviewQueueView';

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderView() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <ReviewQueueView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReviewQueueView', () => {
  afterEach(cleanup);

  it('renders page header', () => {
    renderView();
    expect(screen.getByText('Review Queue')).toBeDefined();
  });

  it('renders subtitle', () => {
    renderView();
    expect(screen.getByText(/AI-proposed infrastructure changes/)).toBeDefined();
  });

  it('renders tab buttons for Pending, Approved, Rejected', () => {
    renderView();
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByText('Approved')).toBeDefined();
    expect(screen.getByText('Rejected')).toBeDefined();
  });

  it('shows connection status', () => {
    renderView();
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('shows empty state when no reviews', () => {
    renderView();
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('No reviews found')).toBeDefined();
  });

  it('shows search input', () => {
    renderView();
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('shows risk filter dropdown', () => {
    renderView();
    const select = screen.getByDisplayValue('All risks');
    expect(select).toBeDefined();
  });

  it('renders empty state message for disconnected pending tab', () => {
    renderView();
    expect(screen.getByText(/Connect to the agent/)).toBeDefined();
  });
});
