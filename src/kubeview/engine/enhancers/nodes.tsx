import React from 'react';
import type { ResourceEnhancer } from './index';
import type { K8sResource } from '../renderers/index';
import { getNodeStatus } from '../renderers/statusUtils';

export const nodeEnhancer: ResourceEnhancer = {
  matches: ['v1/nodes'],

  columns: [
    {
      id: 'status',
      header: 'Status',
      accessorFn: (resource) => {
        const nodeStatus = getNodeStatus(resource);
        return nodeStatus.ready ? 'Ready' : 'NotReady';
      },
      render: (value, resource) => {
        const nodeStatus = getNodeStatus(resource);
        const status = String(value);
        const color = nodeStatus.ready ? 'green' : 'red';

        const warnings = [];
        if (nodeStatus.pressure.disk) warnings.push('DiskPressure');
        if (nodeStatus.pressure.memory) warnings.push('MemoryPressure');
        if (nodeStatus.pressure.pid) warnings.push('PIDPressure');

        const dotClass = `inline-block w-2 h-2 rounded-full mr-2 bg-${color}-500`;

        return (
          <div className="flex flex-col">
            <span className="inline-flex items-center text-sm">
              <span className={dotClass} />
              <span>{status}</span>
            </span>
            {warnings.length > 0 && (
              <span className="text-xs text-orange-600 ml-4 mt-0.5">
                {warnings.join(', ')}
              </span>
            )}
          </div>
        );
      },
      sortable: true,
      priority: 10,
    },
    {
      id: 'roles',
      header: 'Roles',
      accessorFn: (resource) => {
        const nodeStatus = getNodeStatus(resource);
        return nodeStatus.roles.join(', ') || 'worker';
      },
      render: (value) => {
        const roles = String(value);
        const roleList = roles.split(', ').filter(Boolean);

        return (
          <div className="flex flex-wrap gap-1">
            {roleList.map((role) => (
              <span
                key={role}
                className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-900 text-blue-300"
              >
                {role}
              </span>
            ))}
          </div>
        );
      },
      sortable: false,
      priority: 11,
    },
    {
      id: 'version',
      header: 'Version',
      accessorFn: (resource) => {
        const status = resource.status as Record<string, unknown> | undefined;
        const nodeInfo = status?.nodeInfo as Record<string, unknown> | undefined;
        return nodeInfo?.kubeletVersion ?? '-';
      },
      render: (value) => {
        if (!value || value === '-') {
          return <span className="text-slate-500">-</span>;
        }

        return <span className="font-mono text-xs text-slate-300">{String(value)}</span>;
      },
      sortable: true,
      priority: 12,
    },
    {
      id: 'os',
      header: 'OS/Arch',
      accessorFn: (resource) => {
        const status = resource.status as Record<string, unknown> | undefined;
        const nodeInfo = status?.nodeInfo as Record<string, unknown> | undefined;
        const os = nodeInfo?.operatingSystem ?? '-';
        const arch = nodeInfo?.architecture ?? '-';
        return `${os}/${arch}`;
      },
      render: (value) => {
        if (!value || value === '-/-') {
          return <span className="text-slate-500">-</span>;
        }

        return <span className="text-xs text-slate-300">{String(value)}</span>;
      },
      sortable: false,
      priority: 13,
    },
    {
      id: 'pods',
      header: 'Pods',
      accessorFn: (resource) => {
        const status = resource.status as Record<string, unknown> | undefined;
        const allocatable = status?.allocatable as Record<string, unknown> | undefined;
        const capacity = status?.capacity as Record<string, unknown> | undefined;

        const allocatablePods = allocatable?.pods ? String(allocatable.pods) : '-';
        const capacityPods = capacity?.pods ? String(capacity.pods) : '-';

        return `${allocatablePods}/${capacityPods}`;
      },
      render: (value) => {
        if (!value || value === '-/-') {
          return <span className="text-slate-500">-</span>;
        }

        return (
          <span className="font-mono text-sm text-slate-300" title="Allocatable/Capacity">
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
      id: 'cordon-toggle',
      label: 'Cordon/Uncordon',
      icon: 'shield',
      render: (resource, onAction) => {
        const spec = resource.spec as Record<string, unknown> | undefined;
        const unschedulable = Boolean(spec?.unschedulable);

        return (
          <button
            onClick={() => onAction(unschedulable ? 'uncordon' : 'cordon', { resource })}
            className={`inline-flex items-center px-2 py-1 text-xs rounded ${
              unschedulable
                ? 'bg-green-900 text-green-300 hover:bg-green-800'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            title={unschedulable ? 'Uncordon (allow scheduling)' : 'Cordon (prevent scheduling)'}
          >
            <svg
              className="w-3 h-3 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {unschedulable ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              )}
            </svg>
            {unschedulable ? 'Uncordon' : 'Cordon'}
          </button>
        );
      },
    },
    {
      id: 'drain',
      label: 'Drain',
      icon: 'download',
      render: (resource, onAction) => {
        const spec = resource.spec as Record<string, unknown> | undefined;
        const unschedulable = Boolean(spec?.unschedulable);

        return (
          <button
            onClick={() => onAction('drain', { resource })}
            disabled={!unschedulable}
            className="inline-flex items-center px-2 py-1 text-xs bg-orange-900 text-orange-300 rounded hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed ml-2"
            title={unschedulable ? 'Drain node' : 'Cordon first to drain'}
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
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
            Drain
          </button>
        );
      },
    },
  ],

  defaultSort: { column: 'name', direction: 'asc' },
};
