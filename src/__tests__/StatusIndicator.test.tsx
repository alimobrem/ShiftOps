// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusIndicator, { getStatusColor } from '../components/StatusIndicator';

describe('StatusIndicator', () => {
  it('renders the correct status text', () => {
    render(<StatusIndicator status="Running" />);
    expect(screen.getByText('Running')).toBeDefined();
  });

  it('renders different status text', () => {
    render(<StatusIndicator status="Failed" />);
    expect(screen.getByText('Failed')).toBeDefined();
  });
});

describe('getStatusColor', () => {
  it('returns green for Running', () => {
    expect(getStatusColor('Running')).toBe('green');
  });

  it('returns red for Failed', () => {
    expect(getStatusColor('Failed')).toBe('red');
  });

  it('returns orange for Pending', () => {
    expect(getStatusColor('Pending')).toBe('orange');
  });

  it('returns blue for Progressing', () => {
    expect(getStatusColor('Progressing')).toBe('blue');
  });

  it('returns green for Ready', () => {
    expect(getStatusColor('Ready')).toBe('green');
  });

  it('returns grey for unknown statuses', () => {
    expect(getStatusColor('SomeRandomStatus')).toBe('grey');
  });

  it('returns grey for empty string', () => {
    expect(getStatusColor('')).toBe('grey');
  });
});
