// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InlineAgent } from '../InlineAgent';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

const mockSession = {
  connected: true,
  messages: [],
  streaming: false,
  streamingText: '',
  thinkingText: '',
  activeTools: [] as string[],
  streamingComponents: [],
  pendingConfirm: null,
  error: null,
  send: vi.fn(),
  confirm: vi.fn(),
  clear: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('../../../hooks/useAgentSession', () => ({
  useAgentSession: vi.fn(() => mockSession),
}));

vi.mock('../MessageBubble', () => ({
  MessageBubble: ({ message }: any) => <div data-testid="message-bubble">{message.content}</div>,
}));

vi.mock('../MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: any) => <div data-testid="markdown-renderer">{content}</div>,
}));

vi.mock('../AgentComponentRenderer', () => ({
  AgentComponentRenderer: () => <div data-testid="agent-component" />,
}));

vi.mock('../ConfirmationCard', () => ({
  ConfirmationCard: () => <div data-testid="confirmation-card" />,
}));

const defaultContext = {
  kind: 'Deployment',
  name: 'my-app',
  namespace: 'default',
};

describe('InlineAgent', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.messages = [];
    mockSession.streaming = false;
    mockSession.streamingText = '';
    mockSession.thinkingText = '';
    mockSession.activeTools = [];
    mockSession.pendingConfirm = null;
    mockSession.error = null;
  });

  it('renders collapsed by default with "Ask about this" text', () => {
    render(<InlineAgent context={defaultContext} />);
    expect(screen.getByText('Ask about this Deployment')).toBeTruthy();
  });

  it('expands on click', () => {
    render(<InlineAgent context={defaultContext} />);
    fireEvent.click(screen.getByText('Ask about this Deployment'));
    expect(screen.getByPlaceholderText('Ask about this Deployment...')).toBeTruthy();
  });

  it('shows quick prompts when expanded and no messages', () => {
    const quickPrompts = ['Check health', 'Show logs', 'Describe'];
    render(
      <InlineAgent context={defaultContext} defaultExpanded quickPrompts={quickPrompts} />,
    );
    expect(screen.getByText('Check health')).toBeTruthy();
    expect(screen.getByText('Show logs')).toBeTruthy();
    expect(screen.getByText('Describe')).toBeTruthy();
  });

  it('sends message on Enter', () => {
    render(<InlineAgent context={defaultContext} defaultExpanded />);
    const textarea = screen.getByPlaceholderText('Ask about this Deployment...');
    fireEvent.change(textarea, { target: { value: 'What is the status?' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    expect(mockSession.send).toHaveBeenCalledWith('What is the status?');
  });

  it('shows streaming indicators', () => {
    mockSession.thinkingText = 'Analyzing deployment...';
    mockSession.activeTools = ['kubectl_get'];
    mockSession.streamingText = 'The deployment is healthy';
    mockSession.streaming = true;

    render(<InlineAgent context={defaultContext} defaultExpanded />);

    // ThinkingIndicator (compact mode) shows tool name and streaming text
    expect(screen.getByText('kubectl_get')).toBeTruthy();
    expect(screen.getByText('The deployment is healthy')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
  });

  it('renders with defaultExpanded=true', () => {
    render(<InlineAgent context={defaultContext} defaultExpanded />);
    expect(screen.getByPlaceholderText('Ask about this Deployment...')).toBeTruthy();
  });
});
