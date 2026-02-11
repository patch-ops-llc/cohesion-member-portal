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
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-900 mb-6 text-center">
        Project Progress
      </h2>
      
      <div className="flex items-center justify-between">
        {pipelineStages.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div key={stage.id} className="flex items-center flex-1">
              {/* Step */}
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm transition-all',
                    isCompleted && 'bg-primary text-white',
                    isCurrent && 'bg-accent text-white animate-pizza-pulse',
                    isPending && 'bg-gray-200 text-gray-500'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={clsx(
                    'mt-2 text-xs font-medium text-center max-w-[100px]',
                    isCompleted && 'text-primary',
                    isCurrent && 'text-accent',
                    isPending && 'text-gray-400'
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {index < pipelineStages.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-1 mx-2',
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
    <div className="flex items-center space-x-1">
      {pipelineStages.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div
            key={stage.id}
            className={clsx(
              'flex-1 h-2 rounded-full transition-all',
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
