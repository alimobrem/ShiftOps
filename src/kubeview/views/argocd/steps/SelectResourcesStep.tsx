/**
 * SelectResourcesStep — lets users pick which resource categories and namespaces to export.
 */

import React, { useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { useGitOpsSetupStore } from '../../../store/gitopsSetupStore';
import { RESOURCE_CATEGORIES } from '../../../engine/gitopsExport';
import { cn } from '@/lib/utils';

interface Props {
  onComplete: () => void;
}

export function SelectResourcesStep({ onComplete }: Props) {
  const {
    selectedCategories, setSelectedCategories,
    clusterName, setClusterName,
    exportMode, setExportMode,
  } = useGitOpsSetupStore();
  const markComplete = useGitOpsSetupStore((s) => s.markStepComplete);

  const [localSelected, setLocalSelected] = useState<string[]>(
    selectedCategories.length > 0 ? selectedCategories : RESOURCE_CATEGORIES.map((c) => c.id),
  );
  const [localClusterName, setLocalClusterName] = useState(clusterName || 'my-cluster');

  const toggleCategory = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const selectAll = () => setLocalSelected(RESOURCE_CATEGORIES.map((c) => c.id));
  const selectNone = () => setLocalSelected([]);

  const handleContinue = () => {
    setSelectedCategories(localSelected);
    setClusterName(localClusterName);
    markComplete('select-resources');
    onComplete();
  };

  const isValid = localSelected.length > 0 && localClusterName.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-slate-100">Select Resources</h3>
        <p className="text-sm text-slate-400 mt-1">
          Choose which resource categories to export to your Git repository.
        </p>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Cluster Name (directory prefix)</label>
        <input
          type="text"
          value={localClusterName}
          onChange={(e) => setLocalClusterName(e.target.value)}
          placeholder="my-cluster"
          className="w-64 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-600 focus:border-blue-500 outline-none"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1">Export Mode</label>
        <div className="flex gap-3">
          <button
            onClick={() => setExportMode('pr')}
            className={cn(
              'px-3 py-1.5 text-sm rounded border transition-colors',
              exportMode === 'pr'
                ? 'border-blue-500 bg-blue-950/50 text-blue-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-300',
            )}
          >
            Pull Request
          </button>
          <button
            onClick={() => setExportMode('branch')}
            className={cn(
              'px-3 py-1.5 text-sm rounded border transition-colors',
              exportMode === 'branch'
                ? 'border-blue-500 bg-blue-950/50 text-blue-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-300',
            )}
          >
            Branch Only
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Resource Categories</span>
          <div className="flex gap-2 text-xs">
            <button onClick={selectAll} className="text-blue-400 hover:text-blue-300">Select all</button>
            <span className="text-slate-600">|</span>
            <button onClick={selectNone} className="text-blue-400 hover:text-blue-300">None</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {RESOURCE_CATEGORIES.map((cat) => {
            const selected = localSelected.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors',
                  selected
                    ? 'border-blue-600 bg-blue-950/30 text-slate-200'
                    : 'border-slate-700 text-slate-500 hover:text-slate-400',
                )}
              >
                {selected ? (
                  <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleContinue}
        disabled={!isValid}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        Continue ({localSelected.length} selected)
      </button>
    </div>
  );
}
