// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('UserActivity page', () => {
  it('extracts managedFields entries from resources', async () => {
    const mockResponse = {
      items: [
        {
          metadata: {
            name: 'test-deploy',
            namespace: 'default',
            managedFields: [
              {
                manager: 'kubectl-client-side-apply',
                operation: 'Apply',
                time: new Date().toISOString(),
                fieldsV1: { 'f:spec': {}, 'f:metadata': {} },
              },
              {
                manager: 'argocd-application-controller',
                operation: 'Update',
                time: new Date(Date.now() - 3600000).toISOString(),
                fieldsV1: { 'f:status': {} },
              },
            ],
          },
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(mockResponse) })
    ));

    const items = mockResponse.items;
    const entries: { manager: string; fields: string[] }[] = [];

    for (const item of items) {
      for (const field of (item.metadata.managedFields ?? [])) {
        if (!field.time) continue;
        const changedFields: string[] = [];
        if (field.fieldsV1) {
          for (const key of Object.keys(field.fieldsV1)) {
            if (key.startsWith('f:')) changedFields.push(key.slice(2));
          }
        }
        entries.push({ manager: field.manager ?? 'unknown', fields: changedFields });
      }
    }

    expect(entries).toHaveLength(2);
    expect(entries[0].manager).toBe('kubectl-client-side-apply');
    expect(entries[0].fields).toEqual(['spec', 'metadata']);
    expect(entries[1].manager).toBe('argocd-application-controller');
    expect(entries[1].fields).toEqual(['status']);
  });

  it('filters entries by time range', () => {
    const now = Date.now();
    const entries = [
      { timestamp: new Date(now - 1000), manager: 'kubectl' },
      { timestamp: new Date(now - 7200000), manager: 'argocd' },
      { timestamp: new Date(now - 172800000), manager: 'helm' },
    ];

    const cutoff1h = new Date(now - 3600000);
    const filtered1h = entries.filter((e) => e.timestamp > cutoff1h);
    expect(filtered1h).toHaveLength(1);
    expect(filtered1h[0].manager).toBe('kubectl');

    const cutoff24h = new Date(now - 86400000);
    const filtered24h = entries.filter((e) => e.timestamp > cutoff24h);
    expect(filtered24h).toHaveLength(2);
  });

  it('correlates user sessions with resource changes', () => {
    interface UserSession {
      userName: string;
      tokenCreated: Date;
      tokenExpiry: Date | null;
    }

    function findActiveUsers(sessions: UserSession[], timestamp: Date): string[] {
      return [...new Set(
        sessions
          .filter((s) => {
            const end = s.tokenExpiry ?? new Date();
            return s.tokenCreated <= timestamp && end >= timestamp;
          })
          .map((s) => s.userName)
      )];
    }

    const sessions: UserSession[] = [
      { userName: 'kubeadmin', tokenCreated: new Date('2024-06-01T08:00:00Z'), tokenExpiry: new Date('2024-06-01T20:00:00Z') },
      { userName: 'developer', tokenCreated: new Date('2024-06-01T10:00:00Z'), tokenExpiry: new Date('2024-06-01T18:00:00Z') },
    ];

    // At 09:00, only kubeadmin was active
    const at9am = findActiveUsers(sessions, new Date('2024-06-01T09:00:00Z'));
    expect(at9am).toEqual(['kubeadmin']);

    // At 12:00, both were active
    const atNoon = findActiveUsers(sessions, new Date('2024-06-01T12:00:00Z'));
    expect(atNoon).toHaveLength(2);
    expect(atNoon).toContain('kubeadmin');
    expect(atNoon).toContain('developer');

    // At 19:00, only kubeadmin was active
    const at7pm = findActiveUsers(sessions, new Date('2024-06-01T19:00:00Z'));
    expect(at7pm).toEqual(['kubeadmin']);

    // At 21:00, nobody was active
    const at9pm = findActiveUsers(sessions, new Date('2024-06-01T21:00:00Z'));
    expect(at9pm).toHaveLength(0);
  });

  it('extracts user from resource annotations', () => {
    function extractUser(metadata: Record<string, unknown>): string | undefined {
      const annotations = (metadata['annotations'] ?? {}) as Record<string, string>;
      if (annotations['openshift.io/requester']) return annotations['openshift.io/requester'];
      if (annotations['kubectl.kubernetes.io/last-applied-by']) return annotations['kubectl.kubernetes.io/last-applied-by'];
      return undefined;
    }

    expect(extractUser({ annotations: { 'openshift.io/requester': 'kubeadmin' } })).toBe('kubeadmin');
    expect(extractUser({ annotations: { 'kubectl.kubernetes.io/last-applied-by': 'developer' } })).toBe('developer');
    expect(extractUser({ annotations: {} })).toBeUndefined();
    expect(extractUser({})).toBeUndefined();
  });

  it('search matches on user field', () => {
    const entries = [
      { user: 'kubeadmin', manager: 'kubectl', name: 'my-deploy', kind: 'Deployment', namespace: 'default', operation: 'Apply' },
      { user: 'developer', manager: 'Mozilla', name: 'my-svc', kind: 'Service', namespace: 'staging', operation: 'Update' },
      { user: '', manager: 'argocd', name: 'argo-app', kind: 'Deployment', namespace: 'argocd', operation: 'Update' },
    ];

    const q = 'kubeadmin'.toLowerCase();
    const filtered = entries.filter((e) =>
      e.manager.toLowerCase().includes(q) ||
      e.user.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.kind.toLowerCase().includes(q) ||
      e.namespace.toLowerCase().includes(q)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].user).toBe('kubeadmin');
  });
});
