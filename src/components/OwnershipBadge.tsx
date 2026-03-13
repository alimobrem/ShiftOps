import React from 'react';
import { Label, Tooltip, Alert } from '@patternfly/react-core';
import { detectOwnership, type OwnershipInfo } from '@/lib/ownershipDetection';

interface OwnershipBadgeProps {
  resource: Record<string, unknown>;
  showWarning?: boolean;
}

export default function OwnershipBadge({ resource, showWarning = false }: OwnershipBadgeProps) {
  const info = detectOwnership(resource);

  if (info.manager === 'Unknown') return null;

  const badgeText = info.detail ? `${info.manager} (${info.detail})` : info.manager;

  return (
    <>
      <Tooltip content={info.warning || `Managed by ${info.manager}`}>
        <Label color={info.color} isCompact style={{ cursor: 'default' }}>
          {badgeText}
        </Label>
      </Tooltip>
      {showWarning && info.willOverwrite && info.warning && (
        <Alert variant="warning" isInline isPlain title={info.warning} style={{ marginTop: 8 }} />
      )}
    </>
  );
}

export { type OwnershipInfo };
