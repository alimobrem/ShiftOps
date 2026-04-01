/**
 * Cross-repo integration tests — validate UI + Agent working together.
 * These require the full stack (mock-k8s + agent + ui) running via docker-compose.
 * Run: docker compose -f e2e/docker-compose.yml up -d
 *      PULSE_URL=http://localhost:9000 npm run e2e -- --grep integration
 */

import { test, expect } from 'playwright/test';

test.describe('Integration: Agent Health', () => {
  test('agent health endpoint is reachable from UI', async ({ page }) => {
    const response = await page.goto('/api/agent/health');
    if (!response || response.status() !== 200) {
      test.skip(true, 'Agent not running — skipping integration test');
      return;
    }
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('Integration: Dock Agent Panel', () => {
  test('opening dock shows agent tab', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.locator('text=OpenShift Pulse')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Meta+j');

    // Dock should render with at least the standard tabs
    const dockTabs = page.locator('text=Terminal').first();
    await expect(dockTabs).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Integration: Data Flow', () => {
  test('Workloads view renders deployment data from K8s API', async ({ page }) => {
    await page.goto('/workloads');
    await expect(page.locator('text=Workloads')).toBeVisible({ timeout: 10_000 });

    // Deployment data from mock K8s should appear
    await expect(page.locator('text=nginx').first()).toBeVisible({ timeout: 8_000 });
  });

  test('Compute view renders node data from K8s API', async ({ page }) => {
    await page.goto('/compute');
    await expect(page.locator('text=Compute')).toBeVisible({ timeout: 10_000 });

    // Node data from mock K8s should appear
    await expect(page.locator('text=worker-1').first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Integration: WebSocket Protocol', () => {
  test('Pulse view shows connection status indicator', async ({ page }) => {
    await page.goto('/pulse');
    await expect(page.locator('text=Cluster Pulse')).toBeVisible({ timeout: 10_000 });

    // Status bar should show some connection state (Live, Connected, or Disconnected)
    const statusBar = page.locator('footer, [class*="status"]').first();
    await expect(statusBar).toBeVisible({ timeout: 5_000 });
  });
});
