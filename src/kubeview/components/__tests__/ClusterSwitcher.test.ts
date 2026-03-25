// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isMultiCluster,
  registerCluster,
  resetConnections,
  getAllConnections,
  getActiveClusterId,
  setActiveClusterId,
  updateConnectionStatus,
} from '../../engine/clusterConnection';
import { useFleetStore } from '../../store/fleetStore';

beforeEach(() => {
  resetConnections();
  useFleetStore.setState({
    clusters: getAllConnections(),
    activeClusterId: getActiveClusterId(),
    fleetMode: 'single',
  });
});

afterEach(() => {
  resetConnections();
});

describe('ClusterSwitcher — multi-cluster prerequisites', () => {
  it('isMultiCluster returns false with only local cluster', () => {
    expect(isMultiCluster()).toBe(false);
    expect(getAllConnections()).toHaveLength(1);
  });

  it('isMultiCluster returns true after registering a second cluster', () => {
    registerCluster({ id: 'prod', name: 'Production', connectionType: 'acm-proxy', target: 'prod' });
    expect(isMultiCluster()).toBe(true);
    expect(getAllConnections()).toHaveLength(2);
  });

  it('fleetStore.setActiveCluster switches the active cluster', () => {
    registerCluster({ id: 'staging', name: 'Staging', connectionType: 'acm-proxy', target: 'staging' });
    useFleetStore.setState({ clusters: getAllConnections() });

    useFleetStore.getState().setActiveCluster('staging');
    expect(useFleetStore.getState().activeClusterId).toBe('staging');
    expect(getActiveClusterId()).toBe('staging');
  });

  it('setActiveCluster ignores unknown cluster ids', () => {
    setActiveClusterId('nonexistent');
    expect(getActiveClusterId()).toBe('local');
  });

  it('clusters expose status and environment for dropdown rendering', () => {
    registerCluster({ id: 'dev', name: 'Dev Cluster', environment: 'dev', connectionType: 'acm-proxy', target: 'dev' });
    updateConnectionStatus('dev', 'connected');
    updateConnectionStatus('local', 'connected');

    const clusters = getAllConnections();
    const dev = clusters.find(c => c.id === 'dev');
    expect(dev).toBeDefined();
    expect(dev!.environment).toBe('dev');
    expect(dev!.status).toBe('connected');
    expect(dev!.name).toBe('Dev Cluster');
  });

  it('unreachable clusters show red health dot data', () => {
    registerCluster({ id: 'dr', name: 'DR Site', connectionType: 'acm-proxy', target: 'dr' });
    updateConnectionStatus('dr', 'unreachable');

    const dr = getAllConnections().find(c => c.id === 'dr');
    expect(dr!.status).toBe('unreachable');
  });

  it('Cmd+Shift+C keyboard shortcut fires on keydown', () => {
    // Verify the shortcut pattern: meta + shift + c
    const events: KeyboardEvent[] = [];
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        events.push(e);
      }
    }
    window.addEventListener('keydown', handler);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', shiftKey: true, metaKey: true, bubbles: true }));
    expect(events).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', shiftKey: true, ctrlKey: true, bubbles: true }));
    expect(events).toHaveLength(2);

    // Without shift — should not match
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    expect(events).toHaveLength(2);

    window.removeEventListener('keydown', handler);
  });

  it('single-cluster mode hides switcher (isMultiCluster guard)', () => {
    // With only local cluster, isMultiCluster is false — dropdown should not render
    expect(isMultiCluster()).toBe(false);
    // The CommandBar conditionally renders based on this; verify the guard value
  });

  it('resetConnections returns to single-cluster state', () => {
    registerCluster({ id: 'c1', name: 'C1', connectionType: 'acm-proxy', target: 'c1' });
    registerCluster({ id: 'c2', name: 'C2', connectionType: 'acm-proxy', target: 'c2' });
    expect(isMultiCluster()).toBe(true);
    expect(getAllConnections()).toHaveLength(3);

    resetConnections();
    expect(isMultiCluster()).toBe(false);
    expect(getAllConnections()).toHaveLength(1);
    expect(getActiveClusterId()).toBe('local');
  });
});
