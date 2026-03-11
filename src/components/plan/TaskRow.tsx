'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useHorizonStore } from '@/stores';
import { ModelBadge, ComplexityBadge } from '@/components/ui/badge';
import { ModelSelector, ComplexitySelector } from '@/components/ui/dropdown';
import type { Task, Model, Complexity } from '@/types';

interface TaskRowProps {
  task: Task;
  itemId: string;
}

export function TaskRow({ task, itemId }: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateTaskModel = useHorizonStore((state) => state.updateTaskModel);
  const updateTaskComplexity = useHorizonStore((state) => state.updateTaskComplexity);

  const effectiveModel = task.modelOverride ?? task.model;

  const handleModelChange = (model: Model) => {
    updateTaskModel(itemId, task.id, model);
  };

  const handleComplexityChange = (complexity: Complexity) => {
    updateTaskComplexity(itemId, task.id, complexity);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1.5 transition-colors',
        'hover:bg-white/5 cursor-pointer',
        isEditing && 'bg-white/5'
      )}
      onClick={() => setIsEditing(!isEditing)}
    >
      {/* Model Badge/Selector */}
      {isEditing ? (
        <ModelSelector
          value={effectiveModel}
          onChange={handleModelChange}
        />
      ) : (
        <ModelBadge model={effectiveModel} />
      )}

      {/* Task Label */}
      <span className="flex-1 text-xs text-text-primary truncate">
        {task.label}
      </span>

      {/* Complexity Badge/Selector */}
      {isEditing ? (
        <ComplexitySelector
          value={task.complexity}
          onChange={handleComplexityChange}
        />
      ) : (
        <ComplexityBadge complexity={task.complexity} />
      )}

      {/* Conflict Warning */}
      {task.conflictWarning && (
        <span className="text-xs text-accent-amber whitespace-nowrap">
          ⚠ {task.conflictWarning}
        </span>
      )}
    </div>
  );
}
