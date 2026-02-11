import { Link } from 'react-router-dom';
import { FolderOpen, ArrowRight, FileText } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';
import { PizzaTrackerMini } from './PizzaTracker';
import type { Project, CategoryData } from '../../types';

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
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  // Calculate document stats
  const stats = calculateStats(project.documentData);

  return (
    <Link
      to={`/project/${project.id}`}
      className="card p-6 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-50 rounded-lg">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <p className="text-sm text-gray-500">{project.email}</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
      </div>

      {/* Mini pizza tracker */}
      <div className="mb-4">
        <PizzaTrackerMini currentStage={project.stage} />
      </div>

      {/* Document stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="font-semibold text-gray-900">{stats.total}</div>
          <div className="text-gray-500">Total</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2">
          <div className="font-semibold text-amber-700">{stats.pending}</div>
          <div className="text-amber-600">Pending</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2">
          <div className="font-semibold text-blue-700">{stats.accepted}</div>
          <div className="text-blue-600">Accepted</div>
        </div>
      </div>
    </Link>
  );
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
