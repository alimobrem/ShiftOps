// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { NotificationCenter } from '../NotificationCenter';

afterEach(() => cleanup());

describe('NotificationCenter', () => {
  it('does not render when open is false', () => {
    const onClose = vi.fn();
    const { container } = render(<NotificationCenter open={false} onClose={onClose} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open is true', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });

  it('renders all three sections', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    expect(screen.getByText('Active Findings')).toBeTruthy();
    expect(screen.getByText('Predictions')).toBeTruthy();
    expect(screen.getByText('Pending Actions')).toBeTruthy();
  });

  it('shows empty states for all sections', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    expect(screen.getByText('No active findings')).toBeTruthy();
    expect(screen.getByText('No predictions')).toBeTruthy();
    expect(screen.getByText('No pending actions')).toBeTruthy();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    const backdrop = screen.getByTestId('notification-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on X button click', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close notification center');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders severity filter buttons', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByText('Warning')).toBeTruthy();
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('renders Mark all read button', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    expect(screen.getByLabelText('Mark all read')).toBeTruthy();
  });

  it('sections are collapsible', () => {
    const onClose = vi.fn();
    render(<NotificationCenter open={true} onClose={onClose} />);
    // All sections start expanded, showing empty states
    expect(screen.getByText('No active findings')).toBeTruthy();
    // Click the "Active Findings" section header to collapse
    fireEvent.click(screen.getByText('Active Findings'));
    // The empty state should be gone
    expect(screen.queryByText('No active findings')).toBeFalsy();
    // Click again to expand
    fireEvent.click(screen.getByText('Active Findings'));
    expect(screen.getByText('No active findings')).toBeTruthy();
  });
});
