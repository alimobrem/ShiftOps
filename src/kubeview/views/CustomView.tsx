import { useParams } from 'react-router-dom';
import { Trash2, Plus, LayoutDashboard, Bot, Share2, Check, GripVertical, Pencil, Eye } from 'lucide-react';
import { useCustomViewStore } from '../store/customViewStore';
import { useUIStore } from '../store/uiStore';
import { useAgentStore } from '../store/agentStore';
import { AgentComponentRenderer } from '../components/agent/AgentComponentRenderer';
import { EmptyState } from '../components/primitives/EmptyState';
import { formatRelativeTime } from '../engine/formatters';
import { ConfirmDialog } from '../components/feedback/ConfirmDialog';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ComponentSpec } from '../engine/agentComponents';

// react-grid-layout (npm install react-grid-layout @types/react-grid-layout)
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGrid = WidthProvider(Responsive);

/** Generate a sensible default layout based on component kinds */
function generateDefaultLayout(specs: ComponentSpec[]): ReactGridLayout.Layout[] {
  return specs.map((spec, i) => {
    // Full width for summary cards, half width for tables/charts
    const w = spec.kind === 'info_card_grid' || spec.kind === 'tabs' ? 4 : 2;
    const h = spec.kind === 'chart' ? 4 : spec.kind === 'data_table' ? 5 : 3;
    const x = (i * 2) % 4;
    const y = Math.floor((i * 2) / 4) * h;
    return { i: String(i), x, y, w, h, minW: 1, minH: 2 };
  });
}

/** Convert react-grid-layout Layout[] to our positions map */
function layoutToPositions(layout: ReactGridLayout.Layout[]): Record<number, { x: number; y: number; w: number; h: number }> {
  const positions: Record<number, { x: number; y: number; w: number; h: number }> = {};
  for (const item of layout) {
    positions[Number(item.i)] = { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  return positions;
}

/** Convert our positions map to react-grid-layout Layout[] */
function positionsToLayout(positions: Record<number, { x: number; y: number; w: number; h: number }>, count: number): ReactGridLayout.Layout[] {
  return Array.from({ length: count }, (_, i) => {
    const pos = positions[i];
    if (pos) {
      return { i: String(i), ...pos, minW: 1, minH: 2 };
    }
    return { i: String(i), x: (i * 2) % 4, y: Math.floor((i * 2) / 4) * 3, w: 2, h: 3, minW: 1, minH: 2 };
  });
}

export default function CustomView() {
  const { viewId } = useParams<{ viewId: string }>();
  const view = useCustomViewStore((s) => s.getView(viewId || ''));
  const deleteView = useCustomViewStore((s) => s.deleteView);
  const updateView = useCustomViewStore((s) => s.updateView);
  const removeWidget = useCustomViewStore((s) => s.removeWidget);
  const shareView = useCustomViewStore((s) => s.shareView);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [widgetToRemove, setWidgetToRemove] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc && descRef.current) descRef.current.focus();
  }, [editingDesc]);

  const currentLayout = useMemo(() => {
    if (!view) return [];
    if (view.positions && Object.keys(view.positions).length > 0) {
      return positionsToLayout(view.positions, view.layout.length);
    }
    return generateDefaultLayout(view.layout);
  }, [view]);

  const handleLayoutChange = useCallback(
    (layout: ReactGridLayout.Layout[]) => {
      if (!view || !editMode) return;
      // Debounce saves
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        updateView(view.id, { positions: layoutToPositions(layout) });
      }, 500);
    },
    [view, editMode, updateView],
  );

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950">
        <EmptyState
          icon={<LayoutDashboard className="w-12 h-12 text-slate-600" />}
          title="View not found"
          description="This custom view may have been deleted."
        />
      </div>
    );
  }

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== view.title) {
      updateView(view.id, { title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescSave = () => {
    if (descDraft !== view.description) {
      updateView(view.id, { description: descDraft.trim() });
    }
    setEditingDesc(false);
  };

  const handleShare = async () => {
    const token = await shareView(view.id);
    if (token) {
      const url = `${window.location.origin}/share/${token}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full overflow-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="text-2xl font-bold text-slate-100 bg-transparent border-b border-violet-500 outline-none w-full"
              />
            ) : (
              <h1
                className="text-2xl font-bold text-slate-100 flex items-center gap-2 cursor-pointer hover:text-violet-300 transition-colors"
                onClick={() => {
                  setTitleDraft(view.title);
                  setEditingTitle(true);
                }}
              >
                <LayoutDashboard className="w-6 h-6 text-violet-500" />
                {view.title}
              </h1>
            )}
            {editingDesc ? (
              <input
                ref={descRef}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={handleDescSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDescSave();
                  if (e.key === 'Escape') setEditingDesc(false);
                }}
                className="text-sm text-slate-400 bg-transparent border-b border-slate-600 outline-none w-full mt-1"
                placeholder="Add a description..."
              />
            ) : (
              <p
                className="text-sm text-slate-400 mt-1 cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => {
                  setDescDraft(view.description || '');
                  setEditingDesc(true);
                }}
              >
                {view.description || 'Click to add description...'}
              </p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              Created {formatRelativeTime(view.generatedAt)} · {view.layout.length} widget{view.layout.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Edit Mode Toggle */}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                editMode
                  ? 'bg-amber-700 hover:bg-amber-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100'
              }`}
            >
              {editMode ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Done Editing
                </>
              ) : (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Layout
                </>
              )}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Link Copied!' : 'Share'}
            </button>
            <button
              onClick={() => {
                useUIStore.getState().openDock('agent');
                useAgentStore.getState().connectAndSend(`Update my "${view.title}" dashboard — add or modify widgets`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-700 hover:bg-violet-600 text-white rounded transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
              Edit with AI
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>

        {/* Edit mode hint */}
        {editMode && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-amber-900/20 border border-amber-800/50 text-xs text-amber-300">
            <GripVertical className="w-4 h-4" />
            Drag widgets to reorder. Resize from bottom-right corner. Click "Done Editing" when finished.
          </div>
        )}

        {/* Widgets */}
        {view.layout.length === 0 ? (
          <EmptyState
            icon={<Plus className="w-8 h-8 text-slate-600" />}
            title="No widgets yet"
            description="Ask the agent to add widgets to this dashboard."
          />
        ) : (
          <ResponsiveGrid
            layouts={{ lg: currentLayout }}
            breakpoints={{ lg: 1024, md: 768, sm: 480 }}
            cols={{ lg: 4, md: 2, sm: 1 }}
            rowHeight={80}
            isDraggable={editMode}
            isResizable={editMode}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            margin={[16, 16]}
          >
            {view.layout.map((spec, i) => (
              <div key={String(i)} className="rounded-lg border border-slate-800 bg-slate-900 p-4 relative group overflow-auto">
                {editMode && (
                  <>
                    <div className="widget-drag-handle absolute top-2 left-2 p-1 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <button
                      onClick={() => setWidgetToRemove(i)}
                      className="absolute top-2 right-2 p-1 rounded bg-slate-800 text-slate-500 hover:text-red-400 transition-opacity z-10"
                      title="Remove widget"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
                {!editMode && (
                  <button
                    onClick={() => setWidgetToRemove(i)}
                    className="absolute top-2 right-2 p-1 rounded bg-slate-800 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove widget"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <div className={editMode ? 'pl-6' : ''}>
                  <AgentComponentRenderer spec={spec} />
                </div>
              </div>
            ))}
          </ResponsiveGrid>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteView(view.id);
          setConfirmDelete(false);
          window.history.back();
        }}
        title="Delete Dashboard"
        description={`Delete "${view.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />

      <ConfirmDialog
        open={widgetToRemove !== null}
        onClose={() => setWidgetToRemove(null)}
        onConfirm={() => {
          if (widgetToRemove !== null) {
            removeWidget(view.id, widgetToRemove);
            setWidgetToRemove(null);
          }
        }}
        title="Remove Widget"
        description="Remove this widget from the dashboard?"
        confirmLabel="Remove"
        variant="warning"
      />
    </div>
  );
}
