/**
 * ExportStep — drives the cluster-to-git export process with real-time progress.
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Loader2, CheckCircle2, AlertTriangle, Play, XCircle,
  ExternalLink, FileText, Circle,
} from 'lucide-react';
import { useGitOpsSetupStore } from '../../../store/gitopsSetupStore';
import { useGitOpsConfig } from '../../../hooks/useGitOpsConfig';
import { createGitProvider } from '../../../engine/gitProvider';
import {
  RESOURCE_CATEGORIES,
  exportClusterToGit,
  type ExportEvent,
} from '../../../engine/gitopsExport';
import { cn } from '@/lib/utils';

interface Props {
  onComplete: () => void;
}

type CategoryStatus = 'pending' | 'running' | 'done' | 'error';

interface CategoryProgress {
  status: CategoryStatus;
  fileCount: number;
  error?: string;
}

export function ExportStep({ onComplete }: Props) {
  const { exportSelections } = useGitOpsSetupStore();
  const selectedCategories = exportSelections.categoryIds;
  const selectedNamespaces = exportSelections.namespaces;
  const clusterName = exportSelections.clusterName;
  const exportMode = exportSelections.exportMode;
  const markComplete = useGitOpsSetupStore((s) => s.markStepComplete);
  const { config } = useGitOpsConfig();

  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error' | 'cancelled'>('idle');
  const [categoryProgress, setCategoryProgress] = useState<Record<string, CategoryProgress>>({});
  const [committedFiles, setCommittedFiles] = useState<string[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileLogRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(
    () => RESOURCE_CATEGORIES.filter((c) => selectedCategories.includes(c.id)),
    [selectedCategories],
  );
  const repoUrl = config?.repoUrl || '';

  const handleEvent = useCallback((event: ExportEvent) => {
    switch (event.type) {
      case 'category-start':
        setCategoryProgress((prev) => ({
          ...prev,
          [event.categoryId]: { status: 'running', fileCount: 0 },
        }));
        break;
      case 'category-fetched':
        setCategoryProgress((prev) => ({
          ...prev,
          [event.categoryId]: { status: 'running', fileCount: event.resourceCount },
        }));
        break;
      case 'category-committed':
        setCategoryProgress((prev) => {
          const current = prev[event.categoryId];
          return {
            ...prev,
            [event.categoryId]: { status: 'done', fileCount: current?.fileCount || 0 },
          };
        });
        break;
      case 'category-error':
        setCategoryProgress((prev) => ({
          ...prev,
          [event.categoryId]: { status: 'error', fileCount: 0, error: event.error },
        }));
        break;
      case 'complete':
        setTotalFiles(event.type === 'complete' ? event.totalResources : 0);
        if (event.prUrl) setPrUrl(event.prUrl);
        break;
    }
  }, []);

  const handleStart = async () => {
    if (!config) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const initial: Record<string, CategoryProgress> = {};
    for (const cat of categories) {
      initial[cat.id] = { status: 'pending', fileCount: 0 };
    }
    setCategoryProgress(initial);
    setCommittedFiles([]);
    setPhase('running');
    setErrorMessage(null);

    const branchName = `pulse/cluster-export-${Date.now()}`;

    try {
      const generator = exportClusterToGit({
        config,
        clusterName,
        categoryIds: selectedCategories,
        namespaces: selectedNamespaces,
        exportMode,
        branchName,
      });

      for await (const event of generator) {
        if (controller.signal.aborted) break;
        handleEvent(event);

        if (event.type === 'error') {
          setErrorMessage(event.error);
          setPhase('error');
          return;
        }
        if (event.type === 'complete') {
          setPhase('done');
          markComplete('export');
          return;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPhase('cancelled');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Export failed');
        setPhase('error');
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const doneCategories = Object.values(categoryProgress).filter((p) => p.status === 'done').length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-slate-100">Export & Commit</h3>
        <p className="text-sm text-slate-400 mt-1">
          Exporting {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} to{' '}
          <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{clusterName}/</code> in{' '}
          <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">{repoUrl || 'repository'}</code>
        </p>
      </div>

      {phase === 'idle' && (
        <button
          onClick={handleStart}
          disabled={!config || categories.length === 0}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          Start Export
        </button>
      )}

      {phase !== 'idle' && (
        <div className="space-y-2">
          {categories.map((cat) => {
            const progress = categoryProgress[cat.id] || { status: 'pending', fileCount: 0 };
            return (
              <div
                key={cat.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50"
              >
                <div className="flex-shrink-0">
                  {progress.status === 'pending' && <Circle className="w-4 h-4 text-slate-500" />}
                  {progress.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                  {progress.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {progress.status === 'error' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                </div>
                <span
                  className={cn(
                    'text-sm flex-1',
                    progress.status === 'done' && 'text-slate-200',
                    progress.status === 'running' && 'text-blue-300',
                    progress.status === 'error' && 'text-red-300',
                    progress.status === 'pending' && 'text-slate-500',
                  )}
                >
                  {cat.label}
                </span>
                <span className="text-xs text-slate-500">
                  {progress.status === 'done' && `${progress.fileCount} files`}
                  {progress.status === 'error' && progress.error}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {committedFiles.length > 0 && (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">
              Committed files ({committedFiles.length})
            </span>
          </div>
          <div
            ref={fileLogRef}
            className="max-h-40 overflow-y-auto p-2 bg-slate-950"
          >
            {committedFiles.map((f, i) => (
              <div key={i} className="text-xs text-slate-500 font-mono py-0.5 truncate">
                {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'running' && (
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-sm text-red-400 border border-red-800 rounded-lg hover:bg-red-950/30 transition-colors"
        >
          Cancel Export
        </button>
      )}

      {phase === 'error' && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-lg p-3">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p>{errorMessage}</p>
            <button
              onClick={() => setPhase('idle')}
              className="text-blue-400 hover:text-blue-300 mt-2 text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {phase === 'cancelled' && (
        <div className="text-sm text-yellow-400 bg-yellow-950/30 border border-yellow-900 rounded-lg p-3">
          Export was cancelled. Partial files may have been committed to the branch.
          <button
            onClick={() => setPhase('idle')}
            className="block text-blue-400 hover:text-blue-300 mt-2 text-xs"
          >
            Restart
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-950/30 border border-emerald-900 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Exported {totalFiles || committedFiles.length} files across {doneCategories} categories
          </div>

          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-4 h-4" />
              View Pull Request
            </a>
          )}

          <button
            onClick={onComplete}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
