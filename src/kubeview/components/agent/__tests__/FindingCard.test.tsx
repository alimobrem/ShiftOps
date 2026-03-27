// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { FindingCard, type Finding } from '../FindingCard';

afterEach(() => cleanup());

const baseFinding: Finding = {
  id: 'f-1',
  severity: 'critical',
  category: 'Security',
  title: 'Pod running as root',
  summary: 'Container in deployment nginx is running as root user which violates security policy.',
  resources: [
    { kind: 'Pod', name: 'nginx-abc123', namespace: 'default' },
    { kind: 'Deployment', name: 'nginx', namespace: 'default' },
  ],
  autoFixable: true,
  timestamp: Date.now() - 120000, // 2 minutes ago
};

describe('FindingCard', () => {
  it('renders severity badge for critical findings', () => {
    render(<FindingCard finding={baseFinding} />);
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('renders severity badge for warning findings', () => {
    const finding = { ...baseFinding, severity: 'warning' as const };
    render(<FindingCard finding={finding} />);
    expect(screen.getByText('Warning')).toBeTruthy();
  });

  it('renders severity badge for info findings', () => {
    const finding = { ...baseFinding, severity: 'info' as const };
    render(<FindingCard finding={finding} />);
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('renders title and category', () => {
    render(<FindingCard finding={baseFinding} />);
    expect(screen.getByText('Pod running as root')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
  });

  it('renders summary text', () => {
    render(<FindingCard finding={baseFinding} />);
    expect(screen.getByText(/running as root user/)).toBeTruthy();
  });

  it('hides summary in compact mode', () => {
    render(<FindingCard finding={baseFinding} compact />);
    expect(screen.queryByText(/running as root user/)).toBeFalsy();
  });

  it('renders resource list', () => {
    render(<FindingCard finding={baseFinding} />);
    expect(screen.getByText('Pod/default/nginx-abc123')).toBeTruthy();
    expect(screen.getByText('Deployment/default/nginx')).toBeTruthy();
  });

  it('truncates resources beyond 3 and shows +N more', () => {
    const finding: Finding = {
      ...baseFinding,
      resources: [
        { kind: 'Pod', name: 'pod-1', namespace: 'ns' },
        { kind: 'Pod', name: 'pod-2', namespace: 'ns' },
        { kind: 'Pod', name: 'pod-3', namespace: 'ns' },
        { kind: 'Pod', name: 'pod-4', namespace: 'ns' },
        { kind: 'Pod', name: 'pod-5', namespace: 'ns' },
      ],
    };
    render(<FindingCard finding={finding} />);
    expect(screen.getByText('Pod/ns/pod-1')).toBeTruthy();
    expect(screen.getByText('Pod/ns/pod-2')).toBeTruthy();
    expect(screen.getByText('Pod/ns/pod-3')).toBeTruthy();
    expect(screen.queryByText('Pod/ns/pod-4')).toBeFalsy();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it('shows Investigate button and calls onInvestigate', () => {
    const onInvestigate = vi.fn();
    render(<FindingCard finding={baseFinding} onInvestigate={onInvestigate} />);
    const btn = screen.getByText('Investigate');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onInvestigate).toHaveBeenCalledWith(baseFinding);
  });

  it('shows Dismiss button and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(<FindingCard finding={baseFinding} onDismiss={onDismiss} />);
    const btn = screen.getByText('Dismiss');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledWith('f-1');
  });

  it('shows Auto-Fix button when autoFixable is true', () => {
    const onAutoFix = vi.fn();
    render(<FindingCard finding={baseFinding} onAutoFix={onAutoFix} />);
    const btn = screen.getByText('Auto-Fix');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onAutoFix).toHaveBeenCalledWith('f-1');
  });

  it('hides Auto-Fix button when autoFixable is false', () => {
    const finding = { ...baseFinding, autoFixable: false };
    const onAutoFix = vi.fn();
    render(<FindingCard finding={finding} onAutoFix={onAutoFix} />);
    expect(screen.queryByText('Auto-Fix')).toBeFalsy();
  });

  it('applies left border color based on severity', () => {
    const { container } = render(<FindingCard finding={baseFinding} />);
    const card = container.querySelector('[data-testid="finding-card-f-1"]');
    expect(card?.className).toContain('border-l-red-500');
  });

  it('applies amber border for warning severity', () => {
    const finding = { ...baseFinding, id: 'f-2', severity: 'warning' as const };
    const { container } = render(<FindingCard finding={finding} />);
    const card = container.querySelector('[data-testid="finding-card-f-2"]');
    expect(card?.className).toContain('border-l-amber-500');
  });

  it('compact mode uses smaller text', () => {
    render(<FindingCard finding={baseFinding} compact />);
    const title = screen.getByText('Pod running as root');
    expect(title.className).toContain('text-xs');
  });
});
