import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../store/useUIStore';

beforeEach(() => {
  // Reset store state before each test
  useUIStore.setState({
    commandPaletteOpen: false,
    sidebarCollapsed: false,
    toasts: [],
  });
});

describe('useUIStore', () => {
  describe('addToast', () => {
    it('adds a toast to the toasts array', () => {
      const store = useUIStore.getState();
      store.addToast({ type: 'success', title: 'Test toast' });

      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(1);
      const toast = state.toasts.at(0);
      expect(toast).toBeDefined();
      expect(toast!.title).toBe('Test toast');
      expect(toast!.type).toBe('success');
      expect(toast!.id).toBeDefined();
    });

    it('adds multiple toasts', () => {
      const store = useUIStore.getState();
      store.addToast({ type: 'success', title: 'First' });
      store.addToast({ type: 'error', title: 'Second' });

      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(2);
      expect(state.toasts.at(0)!.title).toBe('First');
      expect(state.toasts.at(1)!.title).toBe('Second');
    });
  });

  describe('removeToast', () => {
    it('removes a toast by id', () => {
      const store = useUIStore.getState();
      store.addToast({ type: 'info', title: 'Toast to remove' });

      const toast = useUIStore.getState().toasts.at(0);
      expect(toast).toBeDefined();
      useUIStore.getState().removeToast(toast!.id);

      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it('does not remove other toasts', () => {
      const store = useUIStore.getState();
      store.addToast({ type: 'info', title: 'Keep' });
      store.addToast({ type: 'warning', title: 'Remove' });

      const toastToRemove = useUIStore.getState().toasts.at(1);
      expect(toastToRemove).toBeDefined();
      useUIStore.getState().removeToast(toastToRemove!.id);

      const remaining = useUIStore.getState().toasts;
      expect(remaining).toHaveLength(1);
      expect(remaining.at(0)!.title).toBe('Keep');
    });
  });

  describe('toggleCommandPalette', () => {
    it('toggles commandPaletteOpen from false to true', () => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    });

    it('toggles commandPaletteOpen from true to false', () => {
      useUIStore.setState({ commandPaletteOpen: true });
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });
  });
});
