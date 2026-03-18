import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus, RotateCw, ChevronsUpDown } from 'lucide-react';
import type { ResourceEnhancer } from './index';
import type { K8sResource } from '../renderers/index';
import { getDeploymentStatus } from '../renderers/statusUtils';

function ScaleControl({ resource, onAction }: { resource: K8sResource; onAction: (action: string, params?: any) => void }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = getDeploymentStatus(resource);
  const current = status.desired;

  useEffect(() => {
    if (open && inputRef.current) {
      setInputValue(String(current));
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const scaleTo = (n: number) => {
    const target = Math.max(0, n);
    if (target !== current) {
      onAction('scale-to', { resource, replicas: target });
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded transition-colors text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        title={`Scale (current: ${current})`}
      >
        <ChevronsUpDown className="w-3 h-3" />
        <span>{current}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-slate-600 bg-slate-800 shadow-2xl p-3 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-slate-400 font-medium">Scale Replicas</div>

          {/* Direct input with +/- */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => { const n = Math.max(0, (parseInt(inputValue) || current) - 1); setInputValue(String(n)); }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              ref={inputRef}
              type="number"
              min="0"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') scaleTo(parseInt(inputValue) || 0); if (e.key === 'Escape') setOpen(false); }}
              className="flex-1 px-2 py-1 text-sm text-center bg-slate-900 border border-slate-600 rounded text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => { const n = (parseInt(inputValue) || current) + 1; setInputValue(String(n)); }}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1">
            {[0, 1, 2, 3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => scaleTo(n)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  n === current
                    ? 'bg-blue-600 text-white'
                    : n === 0
                      ? 'bg-slate-700 text-red-400 hover:bg-red-900/50'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {n === 0 ? 'Scale to 0' : n}
              </button>
            ))}
          </div>

          {/* Apply button */}
          <button
            onClick={() => scaleTo(parseInt(inputValue) || 0)}
            disabled={parseInt(inputValue) === current}
            className="w-full py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {parseInt(inputValue) === current ? `Already at ${current}` : `Scale to ${inputValue || 0}`}
          </button>
        </div>
      )}
    </div>
  );
}

export const deploymentEnhancer: ResourceEnhancer = {
  matches: ['apps/v1/deployments', 'apps/v1/statefulsets', 'apps/v1/daemonsets'],

  columns: [
    {
      id: 'status',
      header: 'Status',
      accessorFn: (resource) => {
        const status = getDeploymentStatus(resource);
        if (status.available) return 'Available';
        if (status.progressing) return 'Progressing';
        if (status.ready === 0) return 'Failed';
        return 'Partially Ready';
      },
      render: (value) => {
        const status = String(value);
        let color = 'gray';

        if (status === 'Available') {
          color = 'green';
        } else if (status === 'Progressing') {
          color = 'yellow';
        } else if (status === 'Failed') {
          color = 'red';
        } else {
          color = 'yellow';
        }

        const colorMap: Record<string, string> = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500', gray: 'bg-slate-500' };
        const dotClass = `inline-block w-2 h-2 rounded-full mr-2 ${colorMap[color] || 'bg-slate-500'}`;

        return (
          <span className="inline-flex items-center text-sm">
            <span className={dotClass} />
            <span>{status}</span>
          </span>
        );
      },
      sortable: true,
      priority: 10,
    },
    {
      id: 'ready',
      header: 'Ready',
      accessorFn: (resource) => {
        const status = getDeploymentStatus(resource);
        return `${status.ready}/${status.desired}`;
      },
      render: (value) => {
        const [ready, desired] = String(value).split('/').map(Number);
        const allReady = ready === desired && desired > 0;
        const color = allReady ? 'text-green-400' : ready > 0 ? 'text-yellow-400' : 'text-red-400';

        return (
          <span className={`font-mono text-sm ${color} font-semibold`}>
            {String(value)}
          </span>
        );
      },
      sortable: false,
      priority: 11,
    },
    {
      id: 'image',
      header: 'Image',
      accessorFn: (resource) => {
        const spec = resource.spec as Record<string, unknown> | undefined;
        const template = spec?.template as Record<string, unknown> | undefined;
        const podSpec = template?.spec as Record<string, unknown> | undefined;
        const containers = (podSpec?.containers ?? []) as Array<Record<string, unknown>>;

        if (containers.length === 0) return '-';

        const image = String(containers[0].image ?? '-');
        // Shorten image name (remove registry, keep name:tag)
        const parts = image.split('/');
        return parts[parts.length - 1] ?? image;
      },
      render: (value) => {
        if (!value || value === '-') {
          return <span className="text-slate-500">-</span>;
        }

        const image = String(value);
        const shortened = image.length > 30 ? `${image.slice(0, 27)}...` : image;

        return (
          <span className="font-mono text-xs text-slate-300" title={image}>
            {shortened}
          </span>
        );
      },
      sortable: false,
      width: '25%',
      priority: 12,
    },
    {
      id: 'strategy',
      header: 'Strategy',
      accessorFn: (resource) => {
        const spec = resource.spec as Record<string, unknown> | undefined;
        const strategy = spec?.strategy as Record<string, unknown> | undefined;
        const updateStrategy = spec?.updateStrategy as Record<string, unknown> | undefined;

        return String(strategy?.type ?? updateStrategy?.type ?? '-');
      },
      render: (value) => {
        if (!value || value === '-') {
          return <span className="text-slate-500">-</span>;
        }

        return <span className="text-sm text-slate-300">{String(value)}</span>;
      },
      sortable: false,
      priority: 13,
    },
  ],

  inlineActions: [
    {
      id: 'scale',
      label: 'Scale',
      icon: 'chevrons-up-down',
      render: (resource, onAction) => {
        return <ScaleControl resource={resource} onAction={onAction} />;
      },
    },
    {
      id: 'restart',
      label: 'Restart',
      icon: 'rotate-cw',
      render: (resource, onAction) => {
        return (
          <button
            onClick={() => onAction('restart-rollout', { resource })}
            className="inline-flex items-center px-1.5 py-1 text-xs text-slate-500 rounded hover:bg-orange-900/50 hover:text-orange-400 transition-colors"
            title="Restart Rollout"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        );
      },
    },
  ],

  defaultSort: { column: 'name', direction: 'asc' },
};
