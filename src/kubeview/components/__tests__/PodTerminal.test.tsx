// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));
vi.mock('../../engine/gvr', () => ({ K8S_BASE: '' }));

import PodTerminal from '../PodTerminal';

const defaultProps = {
  namespace: 'default',
  podName: 'nginx-abc-xyz',
  containerName: 'nginx',
  onClose: vi.fn(),
};

function renderTerminal(props: Partial<typeof defaultProps> = {}) {
  return render(<PodTerminal {...defaultProps} {...props} />);
}

describe('PodTerminal', () => {
  afterEach(() => {
    cleanup();
    defaultProps.onClose.mockClear();
  });

  it('renders container name and pod name in header', () => {
    renderTerminal();
    expect(screen.getByText('nginx')).toBeDefined();
    expect(screen.getByText('nginx-abc-xyz')).toBeDefined();
    expect(screen.getByText('default')).toBeDefined();
  });

  it('shows dollar-sign prompt and command input', () => {
    renderTerminal();
    expect(screen.getByText('$')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter command...')).toBeDefined();
  });

  it('displays initial system lines with container info', () => {
    renderTerminal();
    expect(screen.getByText('default/nginx-abc-xyz')).toBeDefined();
    expect(screen.getByText('container: nginx')).toBeDefined();
  });

  it('shows node-specific suggestions when isNode is true', () => {
    renderTerminal({ isNode: true });
    expect(screen.getByText(/cat \/etc\/os-release/)).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    renderTerminal();
    // There are multiple "Close" titled buttons; use the last one (the X button)
    const closeBtns = screen.getAllByTitle('Close');
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders copy and clear buttons', () => {
    renderTerminal();
    expect(screen.getByTitle('Copy output')).toBeDefined();
    expect(screen.getByTitle('Clear (Ctrl+L)')).toBeDefined();
  });
});
