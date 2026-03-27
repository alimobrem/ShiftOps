import React from 'react';
import { Server, Shield, HeartPulse, Eye, Wrench, GitBranch, type LucideIcon } from 'lucide-react';
import { GateCard } from '../GateCard';
import type { CategoryResult, ReadinessCategory } from '../types';

const CATEGORY_ICON: Record<ReadinessCategory, LucideIcon> = {
  prerequisites: Server,
  security: Shield,
  reliability: HeartPulse,
  observability: Eye,
  operations: Wrench,
  gitops: GitBranch,
};

interface Props {
  category: CategoryResult;
  onReVerify?: (gateId: string) => void;
  onWaive?: (gateId: string) => void;
}

/** Generic step component that renders a category header + its gate cards. */
export function CategoryStep({ category, onReVerify, onWaive }: Props) {
  const Icon = CATEGORY_ICON[category.id];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-slate-100 flex items-center gap-2">
          <Icon className="w-5 h-5 text-violet-400" />
          {category.label}
        </h3>
        <p className="text-sm text-slate-400 mt-1">{category.description}</p>
      </div>
      <div className="space-y-2">
        {category.gates.map((gate) => (
          <GateCard key={gate.id} gate={gate} onReVerify={onReVerify} onWaive={onWaive} />
        ))}
      </div>
    </div>
  );
}
