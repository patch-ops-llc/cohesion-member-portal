import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { PipelineStage } from '../../types';
import { pipelineStages } from '../../types';

interface PizzaTrackerProps {
  currentStage: PipelineStage;
}

export function PizzaTracker({ currentStage }: PizzaTrackerProps) {
  const currentIndex = pipelineStages.findIndex(s => s.id === currentStage);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 w-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-5 text-left">
        Project Progress
      </h2>
      
      <div className="flex items-start w-full">
        {pipelineStages.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;
          const isLast = index === pipelineStages.length - 1;

          return (
            <div key={stage.id} className={clsx('flex items-center min-w-0', !isLast && 'flex-1')}>
              {/* Step circle + label */}
              <div className="flex flex-col items-center flex-shrink-0 w-[80px]">
                <div
                  className={clsx(
                    'w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-all shadow-sm',
                    isCompleted && 'bg-primary text-white',
                    isCurrent && 'bg-accent text-white animate-pizza-pulse',
                    isPending && 'bg-gray-100 text-gray-400 border border-gray-200'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={clsx(
                    'mt-2 text-xs font-medium text-center leading-tight',
                    isCompleted && 'text-primary',
                    isCurrent && 'text-accent font-semibold',
                    isPending && 'text-gray-400'
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={clsx(
                    'flex-1 h-1 rounded-full mt-[18px]',
                    index < currentIndex ? 'bg-primary' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mini version for cards
export function PizzaTrackerMini({ currentStage }: PizzaTrackerProps) {
  const currentIndex = pipelineStages.findIndex(s => s.id === currentStage);

  return (
    <div className="flex items-center gap-0.5 w-full">
      {pipelineStages.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div
            key={stage.id}
            className={clsx(
              'flex-1 h-2 rounded-full transition-all min-w-[6px]',
              isCompleted && 'bg-primary',
              isCurrent && 'bg-accent',
              index > currentIndex && 'bg-gray-200'
            )}
            title={stage.label}
          />
        );
      })}
    </div>
  );
}
