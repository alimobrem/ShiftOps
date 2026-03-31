import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { DiffData } from '../../store/reviewStore';

interface DiffViewerProps {
  diff: DiffData;
}

type DiffLineType = 'context' | 'added' | 'removed';

function computeLineDiff(before: string[], after: string[]): Array<{ type: DiffLineType; text: string }> {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const result: Array<{ type: DiffLineType; text: string }> = [];

  let ai = 0;
  let bi = 0;
  while (bi < before.length || ai < after.length) {
    if (bi < before.length && ai < after.length && before[bi] === after[ai]) {
      result.push({ type: 'context', text: before[bi] });
      bi++;
      ai++;
    } else if (bi < before.length && !afterSet.has(before[bi])) {
      result.push({ type: 'removed', text: before[bi] });
      bi++;
    } else if (ai < after.length && !beforeSet.has(after[ai])) {
      result.push({ type: 'added', text: after[ai] });
      ai++;
    } else {
      if (bi < before.length) {
        result.push({ type: 'removed', text: before[bi] });
        bi++;
      }
      if (ai < after.length) {
        result.push({ type: 'added', text: after[ai] });
        ai++;
      }
    }
  }

  return result;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const unifiedDiff = useMemo(
    () => computeLineDiff(diff.before.split('\n'), diff.after.split('\n')),
    [diff.before, diff.after],
  );

  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/80 border-b border-slate-700 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50" />
          Removed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
          Added
        </span>
      </div>

      <div className="overflow-x-auto">
        <pre className="text-xs leading-5 font-mono">
          {unifiedDiff.map((line, i) => (
            <div
              key={i}
              className={cn(
                'px-4 py-0',
                line.type === 'removed' && 'bg-red-950/30 text-red-300',
                line.type === 'added' && 'bg-emerald-950/30 text-emerald-300',
                line.type === 'context' && 'text-slate-400',
              )}
            >
              <span className="inline-block w-4 select-none text-slate-600 mr-2">
                {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
