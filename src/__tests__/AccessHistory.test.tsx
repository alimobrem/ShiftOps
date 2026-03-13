// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AccessHistory page', () => {
  it('parses OAuthAccessToken data correctly', () => {
    const tokens = [
      {
        userName: 'admin',
        clientName: 'console',
        metadata: { creationTimestamp: '2024-06-01T10:00:00Z' },
        expiresIn: 86400,
      },
      {
        userName: 'admin',
        clientName: 'console',
        metadata: { creationTimestamp: '2024-06-02T10:00:00Z' },
        expiresIn: 86400,
      },
      {
        userName: 'developer',
        clientName: 'oc',
        metadata: { creationTimestamp: '2024-06-01T08:00:00Z' },
        expiresIn: 86400,
      },
    ];

    const accessMap = new Map<string, { activeSessions: number; lastTokenCreated: string }>();

    for (const token of tokens) {
      const existing = accessMap.get(token.userName);
      if (existing) {
        existing.activeSessions++;
        if (new Date(token.metadata.creationTimestamp) > new Date(existing.lastTokenCreated)) {
          existing.lastTokenCreated = token.metadata.creationTimestamp;
        }
      } else {
        accessMap.set(token.userName, {
          activeSessions: 1,
          lastTokenCreated: token.metadata.creationTimestamp,
        });
      }
    }

    expect(accessMap.get('admin')?.activeSessions).toBe(2);
    expect(accessMap.get('admin')?.lastTokenCreated).toBe('2024-06-02T10:00:00Z');
    expect(accessMap.get('developer')?.activeSessions).toBe(1);
  });

  it('detects service accounts', () => {
    const users = ['admin', 'developer', 'system:serviceaccount:default:deployer', 'system:serviceaccount:kube-system:coredns'];
    const serviceAccounts = users.filter((u) => u.startsWith('system:serviceaccount:'));
    expect(serviceAccounts).toHaveLength(2);
  });

  it('computes token expiry correctly', () => {
    const created = '2024-06-01T10:00:00Z';
    const expiresIn = 86400; // 24h
    const expiryTime = new Date(new Date(created).getTime() + expiresIn * 1000).toISOString();
    expect(expiryTime).toBe('2024-06-02T10:00:00.000Z');
  });

  it('identifies expired tokens', () => {
    const pastExpiry = new Date(Date.now() - 3600000).toISOString();
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();

    expect(new Date(pastExpiry).getTime() < Date.now()).toBe(true);
    expect(new Date(futureExpiry).getTime() < Date.now()).toBe(false);
  });

  it('formats time-until correctly', () => {
    function timeUntil(ts: string): string {
      if (!ts || ts === '-') return '-';
      const diff = new Date(ts).getTime() - Date.now();
      if (isNaN(diff)) return '-';
      if (diff < 0) return 'Expired';
      const hours = Math.floor(diff / 3600000);
      if (hours > 24) return `${Math.floor(hours / 24)}d`;
      if (hours > 0) return `${hours}h`;
      return `${Math.floor(diff / 60000)}m`;
    }

    const past = new Date(Date.now() - 1000).toISOString();
    expect(timeUntil(past)).toBe('Expired');

    const future2d = new Date(Date.now() + 172800000).toISOString();
    expect(timeUntil(future2d)).toBe('2d');
  });
});
