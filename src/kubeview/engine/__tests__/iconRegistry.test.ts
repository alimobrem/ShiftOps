import { describe, it, expect } from 'vitest';
import { getResourceIcon } from '../iconRegistry';
import { Search, Box, Package, Server } from 'lucide-react';

describe('iconRegistry', () => {
  it('returns correct icon component for valid icon name', () => {
    expect(getResourceIcon('Box')).toBe(Box);
    expect(getResourceIcon('Package')).toBe(Package);
    expect(getResourceIcon('Server')).toBe(Server);
  });

  it('returns Search fallback for unknown icon name', () => {
    expect(getResourceIcon('UnknownIcon')).toBe(Search);
  });

  it('returns Search fallback for undefined icon name', () => {
    expect(getResourceIcon()).toBe(Search);
  });

  it('returns custom fallback when provided', () => {
    expect(getResourceIcon('UnknownIcon', Box)).toBe(Box);
    expect(getResourceIcon(undefined, Package)).toBe(Package);
  });

  it('has all commonly used resource icons', () => {
    const commonIcons = [
      'Box',
      'Package',
      'Network',
      'FileText',
      'Lock',
      'Server',
      'Folder',
      'Globe',
      'HardDrive',
      'Database',
      'Layers',
      'PlayCircle',
      'Clock',
      'File',
    ];

    commonIcons.forEach((iconName) => {
      const icon = getResourceIcon(iconName);
      expect(icon).toBeDefined();
      expect(icon).not.toBe(Search); // Should not fall back for these
    });
  });

  it('has all navigation icons', () => {
    const navIcons = [
      'Home',
      'Activity',
      'Star',
      'Puzzle',
      'Settings',
      'Bell',
      'FilePlus',
    ];

    navIcons.forEach((iconName) => {
      const icon = getResourceIcon(iconName);
      expect(icon).toBeDefined();
      expect(icon).not.toBe(Search);
    });
  });

  it('has all action icons', () => {
    const actionIcons = [
      'ArrowUpDown',
      'RotateCw',
      'Trash2',
      'AlertTriangle',
      'TrendingUp',
      'Search',
    ];

    actionIcons.forEach((iconName) => {
      const icon = getResourceIcon(iconName);
      expect(icon).toBeDefined();
    });
  });
});
