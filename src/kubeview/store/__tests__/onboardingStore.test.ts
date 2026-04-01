// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore } from '../onboardingStore';

describe('onboardingStore', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ aiOnboardingSeen: false });
  });

  it('initializes with aiOnboardingSeen false', () => {
    const state = useOnboardingStore.getState();
    expect(state.aiOnboardingSeen).toBe(false);
  });

  it('dismissOnboarding sets aiOnboardingSeen to true', () => {
    useOnboardingStore.getState().dismissOnboarding();
    expect(useOnboardingStore.getState().aiOnboardingSeen).toBe(true);
  });

  it('dismissOnboarding is idempotent', () => {
    useOnboardingStore.getState().dismissOnboarding();
    useOnboardingStore.getState().dismissOnboarding();
    expect(useOnboardingStore.getState().aiOnboardingSeen).toBe(true);
  });

  it('persists under openshiftpulse-onboarding key', () => {
    // Access the persist config
    const persistOptions = (useOnboardingStore as any).persist;
    expect(persistOptions).toBeDefined();
    expect(persistOptions.getOptions().name).toBe('openshiftpulse-onboarding');
  });
});
