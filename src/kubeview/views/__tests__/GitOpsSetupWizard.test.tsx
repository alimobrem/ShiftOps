/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock engine modules
vi.mock('../../engine/query', () => ({
  k8sList: vi.fn().mockResolvedValue([]),
  k8sGet: vi.fn().mockResolvedValue(null),
  k8sCreate: vi.fn().mockResolvedValue({}),
  k8sPatch: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../hooks/useNavigateTab', () => ({
  useNavigateTab: () => vi.fn(),
}));

vi.mock('../../hooks/useOperatorInstall', () => ({
  useOperatorInstall: () => ({
    install: vi.fn(),
    phase: 'idle',
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('../../store/argoCDStore', () => ({
  useArgoCDStore: Object.assign(
    (selector: (s: any) => any) => {
      const state = { available: false, detected: false, namespace: 'openshift-gitops', applications: [] };
      return selector(state);
    },
    { getState: () => ({ available: false, detected: false, detect: vi.fn(), applications: [], namespace: 'openshift-gitops' }) },
  ),
}));

vi.mock('../../hooks/useGitOpsConfig', () => ({
  useGitOpsConfig: () => ({
    config: null,
    isLoading: false,
    isConfigured: false,
    save: vi.fn(),
    testConnection: vi.fn(),
  }),
}));

vi.mock('../../engine/gitProvider', () => ({
  createGitProvider: vi.fn().mockReturnValue({
    createBranch: vi.fn(),
    createOrUpdateFile: vi.fn(),
    createPullRequest: vi.fn(),
    getFileContent: vi.fn(),
  }),
}));

vi.mock('../../engine/errorToast', () => ({
  showErrorToast: vi.fn(),
}));

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
import { GitOpsSetupWizard } from '../argocd/GitOpsSetupWizard';

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GitOpsSetupWizard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('GitOpsSetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store
    useGitOpsSetupStore.setState({
      wizardOpen: true,
      currentStep: 'operator',
      completedSteps: [],
    });
  });

  it('shows 6 steps in the sidebar', () => {
    renderWizard();
    // Use getAllByText since React StrictMode may double-render
    expect(screen.getAllByText('Install Operator').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Configure Git').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Select Resources').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Export & Commit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Create Apps').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Verification').length).toBeGreaterThan(0);
  });

  it('shows step count as "Step 1 of 6"', () => {
    renderWizard();
    expect(screen.getAllByText('Step 1 of 6').length).toBeGreaterThan(0);
  });

  it('does not render when wizard is closed', () => {
    useGitOpsSetupStore.setState({ wizardOpen: false });
    const { container } = renderWizard();
    expect(container.innerHTML).toBe('');
  });

  it('renders select-resources step when current step is select-resources', () => {
    useGitOpsSetupStore.setState({
      wizardOpen: true,
      currentStep: 'select-resources',
      completedSteps: ['operator', 'git-config'],
    });
    renderWizard();
    expect(screen.getAllByText('Step 3 of 6').length).toBeGreaterThan(0);
  });

  it('renders export step when current step is export', () => {
    useGitOpsSetupStore.setState({
      wizardOpen: true,
      currentStep: 'export',
      completedSteps: ['operator', 'git-config', 'select-resources'],
      selectedCategories: ['deployments'],
      clusterName: 'test',
      exportMode: 'pr' as const,
    });
    renderWizard();
    expect(screen.getAllByText('Step 4 of 6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start Export').length).toBeGreaterThan(0);
  });
});
