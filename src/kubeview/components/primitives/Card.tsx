import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-slate-900 rounded-lg border border-slate-800',
        onClick && 'cursor-pointer hover:border-slate-600 transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function CardHeader({ title, icon, actions }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
      <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {actions}
    </div>
  );
}

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('p-4', className)}>
      {children}
    </div>
  );
}
