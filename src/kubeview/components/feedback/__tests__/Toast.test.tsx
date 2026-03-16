// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToastContainer } from '../Toast';
import { useUIStore } from '../../../store/uiStore';

function resetStore() {
  useUIStore.setState({ toasts: [] });
}

describe('ToastContainer', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no toasts', () => {
    render(<ToastContainer />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('renders success toast', () => {
    useUIStore.getState().addToast({ type: 'success', title: 'Saved!' });

    render(<ToastContainer />);
    expect(screen.getByText('Saved!')).toBeDefined();
  });

  it('renders error toast with detail', () => {
    useUIStore.getState().addToast({
      type: 'error',
      title: 'Delete failed',
      detail: 'Forbidden: insufficient permissions',
    });

    render(<ToastContainer />);
    expect(screen.getByText('Delete failed')).toBeDefined();
    expect(screen.getByText('Forbidden: insufficient permissions')).toBeDefined();
  });

  it('renders error toast with Copy Error button', () => {
    useUIStore.getState().addToast({ type: 'error', title: 'Error' });

    render(<ToastContainer />);
    expect(screen.getByText('Copy Error')).toBeDefined();
  });

  it('renders multiple toasts', () => {
    useUIStore.getState().addToast({ type: 'success', title: 'First' });
    useUIStore.getState().addToast({ type: 'warning', title: 'Second' });

    render(<ToastContainer />);
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
  });

  it('renders undo toast with action button', () => {
    const onClick = vi.fn();
    useUIStore.getState().addToast({
      type: 'undo',
      title: 'Resource deleted',
      duration: 5000,
      action: { label: 'Undo', onClick },
    });

    render(<ToastContainer />);
    expect(screen.getByText('Resource deleted')).toBeDefined();
    expect(screen.getByText('Undo')).toBeDefined();
  });

  it('renders warning toast', () => {
    useUIStore.getState().addToast({ type: 'warning', title: 'Warning!' });

    render(<ToastContainer />);
    expect(screen.getByText('Warning!')).toBeDefined();
  });
});
