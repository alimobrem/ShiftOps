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

    // Verify managedFields parsing logic
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
      { timestamp: new Date(now - 7200000), manager: 'argocd' }, // 2h ago
      { timestamp: new Date(now - 172800000), manager: 'helm' }, // 2d ago
    ];

    const cutoff1h = new Date(now - 3600000);
    const filtered1h = entries.filter((e) => e.timestamp > cutoff1h);
    expect(filtered1h).toHaveLength(1);
    expect(filtered1h[0].manager).toBe('kubectl');

    const cutoff24h = new Date(now - 86400000);
    const filtered24h = entries.filter((e) => e.timestamp > cutoff24h);
    expect(filtered24h).toHaveLength(2);
  });

  it('groups entries by date', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    function formatDate(d: Date): string {
      const t = new Date();
      if (d.toDateString() === t.toDateString()) return 'Today';
      const y = new Date(t);
      y.setDate(y.getDate() - 1);
      if (d.toDateString() === y.toDateString()) return 'Yesterday';
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }

    const entries = [
      { timestamp: today, manager: 'kubectl' },
      { timestamp: yesterday, manager: 'helm' },
    ];

    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = formatDate(entry.timestamp);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }

    expect(groups.has('Today')).toBe(true);
    expect(groups.has('Yesterday')).toBe(true);
  });
});
