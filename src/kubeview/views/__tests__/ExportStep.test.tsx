/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock engine modules
vi.mock('../../engine/query', () => ({
  k8sList: vi.fn().mockResolvedValue([]),
  k8sGet: vi.fn().mockResolvedValue(null),
  k8sPatch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../engine/gitProvider', () => ({
  createGitProvider: vi.fn().mockReturnValue({
    createBranch: vi.fn().mockResolvedValue(undefined),
    createOrUpdateFile: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({ url: 'https://github.com/test/pr/1', number: 1 }),
    getFileContent: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../hooks/useGitOpsConfig', () => ({
  useGitOpsConfig: () => ({
    config: {
      provider: 'github',
      repoUrl: 'https://github.com/org/repo',
      baseBranch: 'main',
      token: 'test-token',
    },
    isLoading: false,
    isConfigured: true,
    save: vi.fn(),
    testConnection: vi.fn(),
  }),
}));

// Mock useUIStore
vi.mock('../../store/uiStore', () => ({
  useUIStore: Object.assign(
    (selector: (s: any) => any) => {
      const state = { addToast: vi.fn(), selectedNamespace: '*' };
      return selector(state);
    },
    { getState: () => ({ impersonateUser: '', impersonateGroups: [] }) },
  ),
}));

import { useGitOpsSetupStore } from '../../store/gitopsSetupStore';
import { ExportStep } from '../argocd/steps/ExportStep';

function renderStep(onComplete = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExportStep onComplete={onComplete} />
    </QueryClientProvider>,
  );
}

describe('ExportStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = useGitOpsSetupStore.getState();
    store.setSelectedCategories(['deployments', 'services']);
    store.setClusterName('test-cluster');
    store.setExportMode('pr');
  });

  it('renders start button', () => {
    renderStep();
    const buttons = screen.getAllByText('Start Export');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows export summary with category count and cluster name', () => {
    renderStep();
    const summaries = screen.getAllByText(/2 categories/);
    expect(summaries.length).toBeGreaterThan(0);
    const clusterNames = screen.getAllByText('test-cluster/');
    expect(clusterNames.length).toBeGreaterThan(0);
  });

  it('shows repository URL in summary', () => {
    renderStep();
    const urls = screen.getAllByText('https://github.com/org/repo');
    expect(urls.length).toBeGreaterThan(0);
  });
});
