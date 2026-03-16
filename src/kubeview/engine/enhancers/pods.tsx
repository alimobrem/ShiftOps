import React from 'react';
import { Link } from 'react-router-dom';
import type { ResourceEnhancer } from './index';
import type { K8sResource } from '../renderers/index';
import { getPodStatus } from '../renderers/statusUtils';

export const podEnhancer: ResourceEnhancer = {
  matches: ['v1/pods'],

  columns: [
    {
      id: 'status',
      header: 'Status',
      accessorFn: (resource) => {
        const podStatus = getPodStatus(resource);
        return podStatus.reason ?? podStatus.phase;
      },
      render: (value, resource) => {
        const podStatus = getPodStatus(resource);
        const displayText = podStatus.reason ?? podStatus.phase;

        let color = 'gray';
        const phase = podStatus.phase.toLowerCase();

        if (phase === 'running' && podStatus.ready) {
          color = 'green';
        } else if (phase === 'succeeded') {
          color = 'green';
        } else if (phase === 'pending') {
          color = 'yellow';
        } else if (phase === 'failed' || podStatus.reason) {
          color = 'red';
        } else if (!podStatus.ready) {
          color = 'yellow';
        }

        const colorMap: Record<string, string> = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500', gray: 'bg-slate-500' };
        const dotClass = `inline-block w-2 h-2 rounded-full mr-2 ${colorMap[color] || 'bg-slate-500'}`;

        return (
          <span className="inline-flex items-center text-sm">
            <span className={dotClass} />
            <span>{displayText}</span>
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
        const status = resource.status as Record<string, unknown> | undefined;
        const containerStatuses = (status?.containerStatuses ?? []) as Array<Record<string, unknown>>;
        const ready = containerStatuses.filter((c) => c.ready === true).length;
        const total = containerStatuses.length;
        return `${ready}/${total}`;
      },
      render: (value) => {
        const [ready, total] = String(value).split('/').map(Number);
        const allReady = ready === total && total > 0;
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
      id: 'restarts',
      header: 'Restarts',
      accessorFn: (resource) => {
        const podStatus = getPodStatus(resource);
        return podStatus.restartCount;
      },
      render: (value) => {
        const restarts = Number(value);
        const color = restarts > 5 ? 'text-red-400' : restarts > 0 ? 'text-yellow-400' : 'text-slate-500';

        return (
          <span className={`font-mono text-sm ${color}`}>
            {restarts}
          </span>
        );
      },
      sortable: true,
      priority: 12,
    },
    {
      id: 'node',
      header: 'Node',
      accessorFn: (resource) => {
        const spec = resource.spec as Record<string, unknown> | undefined;
        return spec?.nodeName ?? '-';
      },
      render: (value) => {
        if (!value || value === '-') {
          return <span className="text-slate-500">-</span>;
        }

        const nodeName = String(value);
        return (
          <Link
            to={`/r/v1~nodes/_/${nodeName}`}
            className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          >
            {nodeName}
          </Link>
        );
      },
      sortable: true,
      priority: 13,
    },
    {
      id: 'ip',
      header: 'IP',
      accessorFn: (resource) => {
        const status = resource.status as Record<string, unknown> | undefined;
        return status?.podIP ?? '-';
      },
      render: (value) => {
        if (!value || value === '-') {
          return <span className="text-slate-500">-</span>;
        }

        return (
          <span className="font-mono text-sm text-slate-300">
            {String(value)}
          </span>
        );
      },
      sortable: false,
      priority: 14,
    },
  ],

  inlineActions: [
    {
      id: 'logs',
      label: 'View Logs',
      icon: 'scroll-text',
      render: (resource) => {
        const namespace = resource.metadata.namespace ?? '';
        const name = resource.metadata.name;

        return (
          <Link
            to={`/logs/${namespace}/${name}`}
            className="inline-flex items-center px-2 py-1 text-xs bg-blue-900 text-blue-300 rounded hover:bg-blue-800"
            title="View Logs"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Logs
          </Link>
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
            onClick={() => onAction('restart', { resource })}
            className="inline-flex items-center px-2 py-1 text-xs bg-orange-900 text-orange-300 rounded hover:bg-orange-800"
            title="Restart Pod (delete to trigger recreation)"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restart
          </button>
        );
      },
    },
  ],

  defaultSort: { column: 'name', direction: 'asc' },
};
