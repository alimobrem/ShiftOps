import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useArgoCDStore } from './argoCDStore';
import { k8sGet } from '../engine/query';

export type WizardStep = 'operator' | 'git-config' | 'select-resources' | 'export' | 'first-app' | 'done';

interface GitOpsSetupState {
  wizardOpen: boolean;
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  dismissed: boolean;

  // Export selections
  selectedCategories: string[];
  selectedNamespaces: string[];
  clusterName: string;
  exportMode: 'branch' | 'pr';

  operatorPhase: 'idle' | 'creating' | 'pending' | 'installing' | 'succeeded' | 'failed';
  operatorError: string | null;

  setSelectedCategories: (cats: string[]) => void;
  setSelectedNamespaces: (ns: string[]) => void;
  setClusterName: (name: string) => void;
  setExportMode: (mode: 'branch' | 'pr') => void;

  openWizard: (resumeAt?: WizardStep) => void;
  closeWizard: () => void;
  setStep: (step: WizardStep) => void;
  markStepComplete: (step: WizardStep) => void;
  setOperatorPhase: (phase: GitOpsSetupState['operatorPhase'], error?: string) => void;
  detectCompletedSteps: () => Promise<void>;
}

export const useGitOpsSetupStore = create<GitOpsSetupState>()(
  persist(
    (set, get) => ({
      wizardOpen: false,
      currentStep: 'operator',
      completedSteps: [],
      dismissed: false,
      selectedCategories: [],
      selectedNamespaces: [],
      clusterName: 'my-cluster',
      exportMode: 'pr',

      operatorPhase: 'idle',
      operatorError: null,

      setSelectedCategories: (cats) => set({ selectedCategories: cats }),
      setSelectedNamespaces: (ns) => set({ selectedNamespaces: ns }),
      setClusterName: (name) => set({ clusterName: name }),
      setExportMode: (mode) => set({ exportMode: mode }),

      openWizard: (resumeAt) => {
        const step = resumeAt || get().currentStep;
        set({ wizardOpen: true, currentStep: step, dismissed: false });
      },

      closeWizard: () => set({ wizardOpen: false }),

      setStep: (step) => set({ currentStep: step }),

      markStepComplete: (step) => {
        const completed = get().completedSteps;
        if (!completed.includes(step)) {
          set({ completedSteps: [...completed, step] });
        }
      },

      setOperatorPhase: (phase, error) =>
        set({ operatorPhase: phase, operatorError: error || null }),

      detectCompletedSteps: async () => {
        const completed: WizardStep[] = [];
        let resumeStep: WizardStep = 'operator';

        // Check operator
        const argoStore = useArgoCDStore.getState();
        if (!argoStore.detected) {
          await argoStore.detect();
        }
        if (useArgoCDStore.getState().available) {
          completed.push('operator');
          resumeStep = 'git-config';
        }

        // Check git config (K8s Secret)
        try {
          await k8sGet('/api/v1/namespaces/openshiftpulse/secrets/openshiftpulse-gitops-config');
          completed.push('git-config');
          resumeStep = 'select-resources';
        } catch {
          // Not configured
        }

        // select-resources and export are transient steps — skip detection

        // Check if apps exist
        if (useArgoCDStore.getState().applications.length > 0) {
          completed.push('first-app');
          resumeStep = 'done';
        }

        const allDone = completed.length >= 3 && completed.includes('first-app');
        set({ completedSteps: completed, currentStep: allDone ? 'done' : resumeStep });
      },
    }),
    {
      name: 'openshiftpulse-gitops-setup',
      partialize: (state) => ({
        completedSteps: state.completedSteps,
        dismissed: state.dismissed,
      }),
    },
  ),
);
