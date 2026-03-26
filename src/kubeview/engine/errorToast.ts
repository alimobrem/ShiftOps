/**
 * Convenience helper for showing error toasts with PulseError enrichment.
 * Replaces 50+ repetitive `addToast({ type: 'error' })` catch blocks.
 */

import { PulseError } from './errors';
import { useUIStore } from '../store/uiStore';
import { useErrorStore } from '../store/errorStore';

/**
 * Show an enriched error toast. If the error is a PulseError, tracks it
 * and includes suggestions. Falls back to basic toast for plain errors.
 */
export function showErrorToast(error: unknown, fallbackTitle?: string): void {
  const addToast = useUIStore.getState().addToast;

  if (error instanceof PulseError) {
    // Track the error
    useErrorStore.getState().trackError({
      id: error.id,
      timestamp: error.timestamp,
      category: error.category,
      message: error.message,
      userMessage: error.userMessage,
      statusCode: error.statusCode,
      operation: error.context.operation,
      resourceKind: error.context.resourceKind,
      resourceName: error.context.resourceName,
      namespace: error.context.namespace,
      suggestions: error.suggestions,
      resolved: false,
    });

    addToast({
      type: 'error',
      title: fallbackTitle || error.userMessage,
      detail: error.userMessage !== error.message ? error.message : undefined,
      errorId: error.id,
      category: error.category,
      suggestions: error.suggestions,
    });
    return;
  }

  // Backward compat: plain Error
  const msg = error instanceof Error ? error.message : String(error);
  addToast({
    type: 'error',
    title: fallbackTitle || 'An error occurred',
    detail: msg,
  });
}
