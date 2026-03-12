// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RelatedResources from '../components/RelatedResources';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('RelatedResources', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { cleanup(); });

  it('shows related pods for a Deployment', async () => {
    global.fetch = vi.fn()
      // Pods
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            { metadata: { name: 'nginx-abc', namespace: 'default', ownerReferences: [{ name: 'nginx-7f6b' }], labels: { app: 'nginx' } }, status: { phase: 'Running' } },
            { metadata: { name: 'nginx-def', namespace: 'default', ownerReferences: [{ name: 'nginx-7f6b' }], labels: { app: 'nginx' } }, status: { phase: 'Running' } },
            { metadata: { name: 'other-pod', namespace: 'default', ownerReferences: [{ name: 'other-rs' }], labels: { app: 'other' } }, status: { phase: 'Running' } },
          ],
        }),
      })
      // Services
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            { metadata: { name: 'nginx-svc', namespace: 'default' }, spec: { type: 'ClusterIP', selector: { app: 'nginx' } } },
          ],
        }),
      })
      // Events
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [
          { reason: 'Scaled', message: 'Scaled up to 2', type: 'Normal', metadata: { creationTimestamp: '2024-01-01T00:00:00Z' } },
        ] }),
      });

    render(
      <MemoryRouter>
        <RelatedResources kind="Deployment" name="nginx" namespace="default" labels={{ app: 'nginx' }} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Should find pods matching labels
      expect(screen.getByText('nginx-abc')).toBeDefined();
      expect(screen.getByText('nginx-def')).toBeDefined();
      // Should NOT show unrelated pod
      expect(screen.queryByText('other-pod')).toBeNull();
      // Should find matching service
      expect(screen.getByText('nginx-svc')).toBeDefined();
      // Should show events
      expect(screen.getByText('Scaled')).toBeDefined();
    });
  });

  it('shows "no related resources" when empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    });

    render(
      <MemoryRouter>
        <RelatedResources kind="Deployment" name="empty-deploy" namespace="default" labels={{}} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No related resources found.')).toBeDefined();
    });
  });

  it('shows count labels for resource groups', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          items: [
            { metadata: { name: 'p1', namespace: 'ns', ownerReferences: [{ name: 'dep' }], labels: {} }, status: { phase: 'Running' } },
            { metadata: { name: 'p2', namespace: 'ns', ownerReferences: [{ name: 'dep' }], labels: {} }, status: { phase: 'Failed' } },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) });

    render(
      <MemoryRouter>
        <RelatedResources kind="Deployment" name="dep" namespace="ns" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined(); // Pod count badge
    });
  });
});
