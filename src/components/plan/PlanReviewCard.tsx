'use client';

import { cn, formatCurrency, calculateSavingsPercent } from '@/lib/utils';
import { useHorizonStore, useUIStore, useWavePlanStore } from '@/stores';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RepoBadge } from '@/components/ui/badge';
import { WorkstreamGrid } from './WorkstreamGrid';
import { CostBreakdown } from './CostBreakdown';
import { WaveProgressBar } from './WaveProgressBar';
import type { HorizonItem } from '@/types';
import { useState, useEffect } from 'react';

interface PlanReviewCardProps {
  item: HorizonItem;
}

export function PlanReviewCard({ item }: PlanReviewCardProps) {
  const approvePlan = useHorizonStore((state) => state.approvePlan);
  const openDiffView = useUIStore((state) => state.openDiffView);
  const getWavePlanByHorizonItem = useWavePlanStore((state) => state.getWavePlanByHorizonItem);

  const [wavePlan, setWavePlan] = useState(() => getWavePlanByHorizonItem(item.id));

  useEffect(() => {
    const unsubscribe = useWavePlanStore.subscribe((state) => {
      setWavePlan(state.getWavePlanByHorizonItem(item.id));
    });
    return unsubscribe;
  }, [item.id]);

  if (!item.plan) return null;

  const { plan } = item;
  const workstreamCount = plan.workstreams.length;
  const taskCount =
    plan.workstreams.reduce((sum, ws) => sum + ws.tasks.length, 0) +
    plan.sequentialTasks.length;

  const handleApprove = async () => {
    await approvePlan(item.id);
  };

  const handleReplan = () => {
    // TODO: Show replan input modal
    console.log('Replan requested');
  };

  const handlePauseWave = async () => {
    if (!wavePlan) return;
    try {
      await fetch(`/api/wave-plans/${wavePlan.id}/pause`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to pause wave plan:', error);
    }
  };

  const handleResumeWave = async () => {
    if (!wavePlan) return;
    try {
      await fetch(`/api/wave-plans/${wavePlan.id}/resume`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to resume wave plan:', error);
    }
  };

  const handleReoptimize = async () => {
    if (!wavePlan) return;
    try {
      await fetch(`/api/items/${item.id}/wave-plan/reoptimize`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to reoptimize wave plan:', error);
    }
  };

  const handleViewDAG = () => {
    if (!wavePlan) return;
    // TODO: Open DAG visualization modal
    console.log('View DAG for wave plan:', wavePlan.id);
  };

  return (
    <Card className="bg-bg-surface border border-border-default relative">
      {/* Wave Plan Overlay */}
      {wavePlan && (
        <div className="absolute top-0 right-0 m-2 z-10">
          <div className="flex items-center gap-2 bg-bg-panel/90 backdrop-blur-sm border border-border-default rounded-lg px-3 py-1.5">
            <span className="text-xs text-accent-primary font-medium">
              {wavePlan.status === 'executing' ? '⚡ Wave Active' :
               wavePlan.status === 'paused' ? '⏸ Paused' :
               wavePlan.status === 're-optimizing' ? '⟳ Re-optimizing' :
               '✓ Wave Plan'}
            </span>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border-default">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {item.linearTicketId && (
                <span className="text-xs text-text-muted">{item.linearTicketId}</span>
              )}
              <span className="text-text-muted">·</span>
              <span className="text-sm font-semibold text-text-primary">
                {item.title}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <RepoBadge repo={item.repo} />
              <span>
                Plan Ready — {workstreamCount} parallel workstream
                {workstreamCount !== 1 ? 's' : ''} · {taskCount} task
                {taskCount !== 1 ? 's' : ''} · ~{formatCurrency(plan.estimatedCostUsd)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!wavePlan && (
              <>
                <Button variant="ghost" size="sm" onClick={handleReplan}>
                  Re-plan ↺
                </Button>
                <Button size="sm" onClick={handleApprove}>
                  Approve →
                </Button>
              </>
            )}
            {wavePlan && (
              <>
                {wavePlan.status === 'executing' && (
                  <Button variant="ghost" size="sm" onClick={handlePauseWave}>
                    Pause
                  </Button>
                )}
                {wavePlan.status === 'paused' && (
                  <Button variant="ghost" size="sm" onClick={handleResumeWave}>
                    Resume
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleReoptimize}>
                  Re-optimize
                </Button>
                <Button variant="ghost" size="sm" onClick={handleViewDAG}>
                  View DAG
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Wave Progress Section */}
        {wavePlan && (
          <div className="p-4 border-b border-border-default bg-bg-panel/30">
            <WaveProgressBar wavePlan={wavePlan} />
          </div>
        )}

        {/* Workstream Grid */}
        <div className="p-4">
          <WorkstreamGrid
            workstreams={plan.workstreams}
            sequentialTasks={plan.sequentialTasks}
            itemId={item.id}
          />
        </div>

        {/* Cost Breakdown */}
        <CostBreakdown plan={plan} />

        {/* Collapsible Sections */}
        <div className="border-t border-border-default">
          <CollapsibleSection
            title={`Acceptance Criteria (${plan.acceptanceCriteria.length})`}
            defaultOpen={false}
          >
            <ul className="list-disc list-inside text-xs text-text-secondary space-y-1">
              {plan.acceptanceCriteria.map((criteria, i) => (
                <li key={i}>{criteria}</li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            title={`Files Touched (${plan.filesTouched.length})`}
            defaultOpen={false}
          >
            <div className="space-y-1">
              {plan.filesTouched.map((file, i) => (
                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                  <FileStatusIndicator status={file.status} />
                  <span className="text-text-secondary truncate">{file.path}</span>
                  {file.inFlightVia && (
                    <span className="text-accent-amber">via {file.inFlightVia}</span>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Collapsible Section
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border-default first:border-t-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left text-xs text-text-secondary hover:bg-white/5 transition-colors"
      >
        <span className={cn('transition-transform', isOpen && 'rotate-90')}>▶</span>
        {title}
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

import { useState } from 'react';
import type { FileStatus } from '@/types';

function FileStatusIndicator({ status }: { status: FileStatus }) {
  const config = {
    available: { icon: '●', color: 'text-accent-green' },
    'in-flight': { icon: '⚠', color: 'text-accent-amber' },
    'recently-modified': { icon: '◎', color: 'text-accent-primary' },
  };

  const { icon, color } = config[status];

  return <span className={cn('w-4', color)}>{icon}</span>;
}
