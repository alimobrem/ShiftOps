/**
 * Icon registry for resource types and UI elements.
 *
 * This registry imports only the specific Lucide icons actually used in the application,
 * preventing the entire 1400+ icon library from being bundled.
 */

import {
  // Resource type icons
  Box,
  Package,
  Network,
  FileText,
  Lock,
  Server,
  Folder,
  Globe,
  HardDrive,
  Database,
  Layers,
  PlayCircle,
  Clock,
  Copy,
  User,
  Shield,
  Link,
  ShieldCheck,
  Link2,
  File,

  // Navigation & action icons
  Home,
  Activity,
  Star,
  Puzzle,
  Settings,
  Stethoscope,
  GitCompare,
  FilePlus,
  ArrowUpDown,
  RotateCw,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Search,
  Bell,

  // Additional action icons
  FileEdit,
  ScrollText,
  Terminal,
  Scale,
  Ban,
  CheckCircle,
  Droplet,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

/**
 * Map of icon names to icon components.
 * Add new icons here when needed.
 */
const iconRegistry: Record<string, LucideIcon> = {
  // Resource types
  Box,
  Package,
  Network,
  FileText,
  Lock,
  Server,
  Folder,
  Globe,
  HardDrive,
  Database,
  Layers,
  PlayCircle,
  Clock,
  Copy,
  User,
  Shield,
  Link,
  ShieldCheck,
  Link2,
  File,

  // Navigation
  Home,
  Activity,
  Star,
  Puzzle,
  Settings,
  Stethoscope,
  GitCompare,
  FilePlus,
  Bell,

  // Actions
  ArrowUpDown,
  RotateCw,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Search,
  FileEdit,
  ScrollText,
  Terminal,
  Scale,
  Ban,
  CheckCircle,
  Droplet,
};

/**
 * Get an icon component by name.
 *
 * @param name - Icon name (e.g., 'Box', 'Package', 'Server')
 * @param fallback - Fallback icon to use if name not found (defaults to Search)
 * @returns The icon component
 */
export function getResourceIcon(name?: string, fallback: LucideIcon = Search): LucideIcon {
  if (!name) return fallback;
  return iconRegistry[name] || fallback;
}
