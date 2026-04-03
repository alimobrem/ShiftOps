import { Outlet } from 'react-router-dom';
import { CommandBar } from './CommandBar';
import { TabBar } from './TabBar';
import { Dock } from './Dock';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { ResourceBrowser } from './ResourceBrowser';
import { ToastContainer } from './feedback/Toast';
import { ErrorBoundary, CssHealthCheck } from './ErrorBoundary';
import { SaveViewWatcher } from './agent/SaveViewWatcher';
import { useKeyboardShortcuts, useDiscovery } from '../hooks';
import { useUIStore } from '../store/uiStore';
import { useCustomViewStore } from '../store/customViewStore';
import { registerBuiltinEnhancers } from '../engine/enhancers/register';
import { startAgentNotifications, stopAgentNotifications } from '../engine/agentNotifications';
import { useEffect } from 'react';

// Register enhancers once at module load
registerBuiltinEnhancers();

export function Shell() {
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Trigger API discovery on mount
  useDiscovery();

  // Start background agent notifications
  useEffect(() => {
    startAgentNotifications();
    return () => stopAgentNotifications();
  }, []);

  // Load custom views from backend on mount
  useEffect(() => {
    useCustomViewStore.getState().loadViews();
  }, []);

  // Get overlay state
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const browserOpen = useUIStore((s) => s.browserOpen);
  const dockPanel = useUIStore((s) => s.dockPanel);
  const viewBuilderMode = useUIStore((s) => s.viewBuilderMode);
  const exitViewBuilder = useUIStore((s) => s.exitViewBuilder);
  const impersonateUser = useUIStore((s) => s.impersonateUser);
  const clearImpersonation = useUIStore((s) => s.clearImpersonation);
  const sessionExpired = useUIStore((s) => s.degradedReasons.has('session_expired'));
  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      {/* Session expired banner */}
      {sessionExpired && (
        <div className="flex items-center justify-between px-4 py-2 bg-red-900/60 border-b border-red-700 text-xs">
          <span className="text-red-200">Your session has expired. API requests are failing with 401 Unauthorized.</span>
          <button onClick={() => window.location.reload()} className="px-3 py-1 text-white bg-red-700 hover:bg-red-600 rounded font-medium transition-colors">Re-authenticate</button>
        </div>
      )}
      {/* Impersonation banner */}
      {impersonateUser && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-amber-900/50 border-b border-amber-700 text-xs">
          <span className="text-amber-200">Impersonating <span className="font-mono font-bold">{impersonateUser}</span> — all API requests use this identity</span>
          <button onClick={clearImpersonation} className="px-2 py-0.5 text-amber-300 hover:text-white bg-amber-800 hover:bg-amber-700 rounded transition-colors">Stop</button>
        </div>
      )}

      {/* Command bar at top */}
      <CommandBar />

      {/* Tab bar */}
      <TabBar />

      {/* Builder mode banner */}
      {viewBuilderMode && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-violet-900/50 border-b border-violet-700 text-xs">
          <span className="text-violet-200">Building View — add widgets from the chat, drag to arrange, resize to fit</span>
          <button onClick={() => { exitViewBuilder(); useCustomViewStore.getState().setActiveBuilderId(null); }} className="px-3 py-1 text-white bg-violet-700 hover:bg-violet-600 rounded font-medium transition-colors">Done</button>
        </div>
      )}

      {/* Main content area + right dock */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Dock (right-side panel) — forced open in builder mode */}
        {(dockPanel || viewBuilderMode) && <Dock />}
      </div>

      {/* Status bar at bottom */}
      <StatusBar />

      {/* Overlay components */}
      {commandPaletteOpen && <CommandPalette />}
      {browserOpen && <ResourceBrowser />}
      <ToastContainer />
      <SaveViewWatcher />
      <CssHealthCheck />
    </div>
  );
}
