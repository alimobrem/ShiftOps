import React from 'react';
import type { ResourceEnhancer } from './index';
import type { K8sResource } from '../renderers/index';
import { getDeploymentStatus } from '../renderers/statusUtils';

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
      id: 'scale-down',
      label: 'Scale Down',
      icon: 'minus',
      render: (resource, onAction) => {
        const status = getDeploymentStatus(resource);

        return (
          <button
            onClick={() => onAction('scale', { resource, delta: -1 })}
            disabled={status.desired === 0}
            className="inline-flex items-center px-1.5 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Scale Down"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
        );
      },
    },
    {
      id: 'scale-display',
      label: 'Replicas',
      icon: 'hash',
      render: (resource) => {
        const status = getDeploymentStatus(resource);

        return (
          <span className="inline-flex items-center px-2 py-1 text-xs font-mono bg-blue-900 text-blue-300 rounded">
            {status.desired}
          </span>
        );
      },
    },
    {
      id: 'scale-up',
      label: 'Scale Up',
      icon: 'plus',
      render: (resource, onAction) => {
        return (
          <button
            onClick={() => onAction('scale', { resource, delta: 1 })}
            className="inline-flex items-center px-1.5 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
            title="Scale Up"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        );
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
            className="inline-flex items-center px-2 py-1 text-xs bg-orange-900 text-orange-300 rounded hover:bg-orange-800 ml-2"
            title="Restart Rollout"
          >
            <svg
              className="w-3 h-3 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Restart
          </button>
        );
      },
    },
  ],

  defaultSort: { column: 'name', direction: 'asc' },
};
