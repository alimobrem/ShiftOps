// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import type { AgentEvent } from '../../../engine/agentClient';

/* ---- Mock AgentClient ---- */

let mockHandler: ((event: AgentEvent) => void) | null = null;
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSend = vi.fn();

vi.mock('../../../engine/agentClient', () => ({
  AgentClient: class {
    on(handler: (event: any) => void) {
      mockHandler = handler;
      return () => {};
    }
    connect() { mockConnect(); }
    disconnect() { mockDisconnect(); }
    send(content: string) { mockSend(content); }
  },
}));

import { NLFilterBar } from '../NLFilterBar';

afterEach(() => cleanup());

beforeEach(() => {
  mockHandler = null;
  mockConnect.mockClear();
  mockDisconnect.mockClear();
  mockSend.mockClear();
});

const defaultProps = {
  resourceKind: 'Pod',
  columns: ['Name', 'Status', 'Namespace'],
  onFiltersApplied: vi.fn(),
};

describe('NLFilterBar', () => {
  it('renders input with correct placeholder', () => {
    render(<NLFilterBar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Describe what you're looking for...");
    expect(input).toBeTruthy();
  });

  it('shows loading spinner after submitting query', () => {
    render(<NLFilterBar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Describe what you're looking for...");
    fireEvent.change(input, { target: { value: 'show running pods' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Loading state: the input should be disabled
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('calls onFiltersApplied with parsed JSON from agent response', () => {
    const onFiltersApplied = vi.fn();
    render(<NLFilterBar {...defaultProps} onFiltersApplied={onFiltersApplied} />);
    const input = screen.getByPlaceholderText("Describe what you're looking for...");
    fireEvent.change(input, { target: { value: 'running pods' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Simulate connected event
    act(() => { mockHandler?.({ type: 'connected' } as any); });

    // Simulate done with JSON
    act(() => {
      mockHandler?.({ type: 'done', full_response: '{ "Status": "Running" }' } as any);
    });

    expect(onFiltersApplied).toHaveBeenCalledWith({ Status: 'Running' });
  });

  it('shows error hint for non-JSON agent response', () => {
    render(<NLFilterBar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Describe what you're looking for...");
    fireEvent.change(input, { target: { value: 'something weird' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    act(() => { mockHandler?.({ type: 'connected' } as any); });
    act(() => {
      mockHandler?.({ type: 'done', full_response: 'I cannot parse that' } as any);
    });

    expect(screen.getByText('I cannot parse that')).toBeTruthy();
  });

  it('handles agent error gracefully', () => {
    render(<NLFilterBar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Describe what you're looking for...");
    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    act(() => {
      mockHandler?.({ type: 'error', message: 'Connection failed' } as any);
    });

    expect(screen.getByText('Connection failed')).toBeTruthy();
  });
});
