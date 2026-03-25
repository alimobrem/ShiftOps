/**
 * Agent Store — manages chat state for the Pulse Agent integration.
 * Messages persist to localStorage so conversation survives navigation.
 * Component specs from tools are accumulated during streaming and merged into messages.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AgentClient,
  type AgentMode,
  type AgentMessage,
  type AgentEvent,
  type ConfirmRequest,
  type ResourceContext,
} from '../engine/agentClient';
import { type ComponentSpec, truncateForPersistence } from '../engine/agentComponents';

interface AgentState {
  // Connection
  connected: boolean;
  mode: AgentMode;

  // Chat (persisted)
  messages: AgentMessage[];

  // Streaming (transient)
  streaming: boolean;
  streamingText: string;
  thinkingText: string;
  activeTools: string[];
  streamingComponents: ComponentSpec[];

  // Confirmation
  pendingConfirm: ConfirmRequest | null;

  // Error
  error: string | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (content: string, context?: ResourceContext) => void;
  switchMode: (mode: AgentMode) => void;
  clearChat: () => void;
  confirmAction: (approved: boolean) => void;
  cancelQuery: () => void;
  editLastMessage: () => string;
}

let client: AgentClient | null = null;
let unsubscribe: (() => void) | null = null;
let nextId = 1;

function makeId(): string {
  return `msg-${nextId++}`;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      connected: false,
      mode: 'sre',
      messages: [],
      streaming: false,
      streamingText: '',
      thinkingText: '',
      activeTools: [],
      streamingComponents: [],
      pendingConfirm: null,
      error: null,

      connect: () => {
        if (unsubscribe) unsubscribe();
        if (client) client.disconnect();
        client = new AgentClient(get().mode);

        unsubscribe = client.on((event: AgentEvent) => {
          switch (event.type) {
            case 'connected':
              set({ connected: true, error: null });
              break;
            case 'disconnected':
              set({ connected: false });
              break;
            case 'text_delta':
              set((s) => ({ streamingText: s.streamingText + event.text }));
              break;
            case 'thinking_delta':
              set((s) => ({ thinkingText: s.thinkingText + event.thinking }));
              break;
            case 'tool_use':
              set((s) => ({ activeTools: [...s.activeTools, event.tool] }));
              break;
            case 'component':
              set((s) => ({ streamingComponents: [...s.streamingComponents, event.spec] }));
              break;
            case 'confirm_request':
              set({ pendingConfirm: { tool: event.tool, input: event.input } });
              break;
            case 'done': {
              const components = get().streamingComponents.map(truncateForPersistence);
              const msg: AgentMessage = {
                id: makeId(),
                role: 'assistant',
                content: event.full_response,
                timestamp: Date.now(),
                components: components.length > 0 ? components : undefined,
              };
              set((s) => ({
                messages: [...s.messages, msg],
                streaming: false,
                streamingText: '',
                thinkingText: '',
                activeTools: [],
                streamingComponents: [],
                pendingConfirm: null,
              }));
              break;
            }
            case 'error':
              set({
                error: event.message,
                streaming: false,
                streamingText: '',
                thinkingText: '',
                activeTools: [],
                streamingComponents: [],
              });
              break;
            case 'cleared':
              set({ messages: [], streamingText: '', thinkingText: '', activeTools: [], streamingComponents: [] });
              break;
          }
        });

        client.connect();
      },

      disconnect: () => {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        if (client) { client.disconnect(); client = null; }
        set({ connected: false });
      },

      sendMessage: (content, context) => {
        if (!client) return;

        const userMsg: AgentMessage = {
          id: makeId(),
          role: 'user',
          content,
          timestamp: Date.now(),
          context,
        };

        set((s) => ({
          messages: [...s.messages, userMsg],
          streaming: true,
          streamingText: '',
          thinkingText: '',
          activeTools: [],
          streamingComponents: [],
          error: null,
        }));

        client.send(content, context);
      },

      switchMode: (mode) => {
        set({ mode, messages: [], streamingText: '', thinkingText: '', activeTools: [], streamingComponents: [] });
        if (client) client.switchMode(mode);
      },

      clearChat: () => {
        set({ messages: [], streamingText: '', thinkingText: '', activeTools: [], streamingComponents: [], error: null });
        if (client) client.clear();
      },

      confirmAction: (approved) => {
        set({ pendingConfirm: null });
        if (client) client.confirm(approved);
      },

      cancelQuery: () => {
        // Disconnect and immediately reconnect to abort the running query
        if (client) {
          client.disconnect();
          client = new AgentClient(get().mode);
          if (unsubscribe) unsubscribe();
          // Re-register the event handler (connect will be called by the component)
        }
        // Save any partial streaming text as the assistant response
        const partial = get().streamingText;
        if (partial) {
          const msg: AgentMessage = {
            id: makeId(),
            role: 'assistant',
            content: partial + '\n\n*(cancelled)*',
            timestamp: Date.now(),
            components: get().streamingComponents.length > 0 ? get().streamingComponents : undefined,
          };
          set((s) => ({
            messages: [...s.messages, msg],
            streaming: false,
            streamingText: '',
            thinkingText: '',
            activeTools: [],
            streamingComponents: [],
            pendingConfirm: null,
          }));
        } else {
          set({
            streaming: false,
            streamingText: '',
            thinkingText: '',
            activeTools: [],
            streamingComponents: [],
            pendingConfirm: null,
          });
        }
        // Reconnect
        get().connect();
      },

      editLastMessage: () => {
        const messages = get().messages;
        // Find the last user message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            const content = messages[i].content;
            // Remove the last user message and any assistant response after it
            set({ messages: messages.slice(0, i) });
            if (client) client.clear();
            return content;
          }
        }
        return '';
      },
    }),
    {
      name: 'openshiftpulse-agent',
      partialize: (state) => ({
        messages: state.messages,
        mode: state.mode,
      }),
    },
  ),
);
