/**
 * Agent Notifications — background polling service that queries the agent
 * for predicted issues and pushes toast notifications.
 */

import { AgentClient } from './agentClient';
import type { AgentEvent } from './agentClient';
import { useUIStore } from '../store/uiStore';
import { useAgentStore } from '../store/agentStore';

const DEFAULT_INTERVAL = 300_000; // 5 minutes
const PROMPT = 'Briefly check for critical issues or anomalies. For each issue, name the affected resource and give a one-line fix. 3 sentences max. If nothing notable, respond with just "OK".';

let client: AgentClient | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

function query(): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = new AgentClient('sre');
    client = c;

    const unsub = c.on((event: AgentEvent) => {
      switch (event.type) {
        case 'connected':
          c.send(PROMPT);
          break;
        case 'done':
          unsub();
          c.disconnect();
          client = null;
          resolve(event.full_response);
          break;
        case 'error':
          unsub();
          c.disconnect();
          client = null;
          reject(new Error(event.message));
          break;
        case 'disconnected':
          // If we haven't resolved yet, reject
          client = null;
          reject(new Error('Disconnected'));
          break;
      }
    });

    c.connect();
  });
}

async function poll() {
  try {
    const response = await query();
    const trimmed = response.trim();

    // Only notify if the agent found something notable
    if (trimmed && trimmed !== 'OK' && trimmed.toLowerCase() !== 'ok') {
      const store = useUIStore.getState();
      store.addToast({
        type: 'warning',
        title: 'AI Insight',
        detail: trimmed,
        duration: 15000,
        action: {
          label: 'Investigate',
          onClick: () => {
            store.openDock('agent');
            // Send the insight to the agent so it continues the thread
            const agentStore = useAgentStore.getState();
            if (agentStore.connected) {
              agentStore.sendMessage(`The background health check found this issue:\n\n"${trimmed}"\n\nInvestigate this further. What is the root cause and what should I do to fix it?`);
            }
          },
        },
      });
    }
  } catch {
    // Silently skip — agent may be unavailable
  }
}

export function startAgentNotifications(intervalMs = DEFAULT_INTERVAL) {
  if (running) return;
  running = true;

  // Don't poll immediately — wait for the first interval
  intervalId = setInterval(poll, intervalMs);
}

export function stopAgentNotifications() {
  running = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (client) {
    client.disconnect();
    client = null;
  }
}

export function isAgentNotificationsRunning(): boolean {
  return running;
}
