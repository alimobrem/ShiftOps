import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ErrorCategory } from '../engine/errors';

export interface TrackedError {
  id: string;
  timestamp: number;
  category: ErrorCategory;
  message: string;
  userMessage: string;
  statusCode: number;
  operation: string;
  resourceKind?: string;
  resourceName?: string;
  namespace?: string;
  suggestions: string[];
  resolved: boolean;
  resolvedAt?: number;
  userAction?: string;
}

const MAX_ERRORS = 200;

interface ErrorState {
  errors: TrackedError[];
  trackError: (error: TrackedError) => void;
  resolveError: (id: string, action?: string) => void;
  clearResolved: () => void;
  getUnresolvedCount: () => number;
}

export const useErrorStore = create<ErrorState>()(
  persist(
    (set, get) => ({
      errors: [],

      trackError: (error) =>
        set((state) => {
          const errors = [error, ...state.errors];
          // FIFO eviction — resolved first, then oldest
          if (errors.length > MAX_ERRORS) {
            const resolved = errors.filter((e) => e.resolved);
            const unresolved = errors.filter((e) => !e.resolved);
            if (resolved.length > 0) {
              resolved.pop(); // Remove oldest resolved
              return { errors: [...unresolved, ...resolved] };
            }
            errors.pop(); // Remove oldest
          }
          return { errors };
        }),

      resolveError: (id, action) =>
        set((state) => ({
          errors: state.errors.map((e) =>
            e.id === id
              ? { ...e, resolved: true, resolvedAt: Date.now(), userAction: action }
              : e,
          ),
        })),

      clearResolved: () =>
        set((state) => ({
          errors: state.errors.filter((e) => !e.resolved),
        })),

      getUnresolvedCount: () =>
        get().errors.filter((e) => !e.resolved).length,
    }),
    {
      name: 'openshiftpulse-errors',
      partialize: (state) => ({ errors: state.errors.slice(0, MAX_ERRORS) }),
    },
  ),
);
