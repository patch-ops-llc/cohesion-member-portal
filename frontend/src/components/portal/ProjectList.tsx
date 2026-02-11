import { Link } from 'react-router-dom';
import { FolderOpen, ArrowRight, FileText, Folder, AlertCircle } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import { PizzaTrackerMini } from './PizzaTracker';
import type { Project, CategoryData } from '../../types';
import { pipelineStages } from '../../types';

export function ProjectList() {
  const { data: projects, isLoading, error, refetch } = useProjects();

  if (isLoading) {
    return <InlineLoader message="Loading your projects..." />;
  }

  if (error) {
    return (
      <ErrorMessage 
        message={error instanceof Error ? error.message : 'Failed to load projects'} 
        onRetry={refetch}
      />
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-center py-12">
        <FolderOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
        <p className="text-gray-600">
          You don't have any active projects yet. Please contact us if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Projects</h1>
      
      <div className="flex flex-col gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const stats = calculateStats(project.documentData);
  const categoryBreakdown = getCategoryBreakdown(project.documentData);
  const currentStageLabel = pipelineStages.find(s => s.id === project.stage)?.label ?? project.stage;

  return (
    <Link
      to={`/project/${project.id}`}
      className="card p-6 hover:shadow-md transition-shadow group block w-full"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Left: Project info & stage */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary-50 rounded-lg shrink-0">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors truncate">
                  {project.name}
                </h3>
                <p className="text-sm text-gray-500">{project.email}</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors shrink-0" />
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary">
              {currentStageLabel}
            </span>
            {project.fileDirectory && (
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                <Folder className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{project.fileDirectory}</span>
              </span>
            )}
          </div>

          <div className="mb-4">
            <PizzaTrackerMini currentStage={project.stage} />
          </div>
        </div>

        {/* Right: Stats & category breakdown */}
        <div className="flex flex-col sm:flex-row gap-4 md:min-w-[360px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="font-semibold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="font-semibold text-amber-700">{stats.pending}</div>
              <div className="text-xs text-amber-600">Pending</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="font-semibold text-blue-700">{stats.accepted}</div>
              <div className="text-xs text-blue-600">Accepted</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="font-semibold text-red-700">{stats.needsAction}</div>
              <div className="text-xs text-red-600 flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Needs action
              </div>
            </div>
          </div>

          {categoryBreakdown.length > 0 && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-2">Document categories</div>
              <div className="flex flex-wrap gap-2">
                {categoryBreakdown.map(({ label, count }) => (
                  <span
                    key={label}
                    className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs"
                  >
                    {label}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function getCategoryBreakdown(documentData?: Project['documentData']): { label: string; count: number }[] {
  const breakdown: { label: string; count: number }[] = [];
  if (!documentData) return breakdown;

  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;
    const category = documentData[key] as CategoryData;
    if (category.status === 'active' && category.documents?.length) {
      breakdown.push({ label: category.label, count: category.documents.length });
    }
  }
  return breakdown;
}

function calculateStats(documentData?: Project['documentData']) {
  const stats = { total: 0, pending: 0, accepted: 0, needsAction: 0 };
  
  if (!documentData) return stats;

  for (const key of Object.keys(documentData)) {
    if (key === '_meta') continue;
    const category = documentData[key] as CategoryData;
    if (category.documents) {
      for (const doc of category.documents) {
        stats.total++;
        if (doc.status === 'pending_review') stats.pending++;
        if (doc.status === 'accepted') stats.accepted++;
        if (doc.status === 'needs_resubmission' || doc.status === 'missing_files') {
          stats.needsAction++;
        }
      }
    }
  }

  return stats;
}
