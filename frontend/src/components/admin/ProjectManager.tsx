import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, FolderOpen, ArrowRight, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';
import { ErrorMessage } from '../shared/ErrorBoundary';

interface AdminProject {
  id: string;
  name: string;
  email: string;
  pipelineStage: string;
  stats: {
    totalDocs: number;
    pendingDocs: number;
    acceptedDocs: number;
  };
}

export function ProjectManager() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'projects', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      
      const response = await api.get<{ 
        success: boolean; 
        projects: AdminProject[]; 
        total: number;
        hasMore: boolean;
      }>(`/admin/projects?${params}`);
      return response.data;
    }
  });

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search projects by name or email..."
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Results */}
      {isLoading ? (
        <InlineLoader message="Loading projects..." />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load projects'}
          onRetry={refetch}
        />
      ) : !data?.projects.length ? (
        <div className="text-center py-12">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accepted
                </th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.projects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{project.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {project.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="text-gray-900">{project.stats.totalDocs}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {project.stats.pendingDocs > 0 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                        {project.stats.pendingDocs}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {project.stats.acceptedDocs > 0 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                        {project.stats.acceptedDocs}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      to={`/admin/projects/${project.id}`}
                      className="text-primary hover:text-primary-800 flex items-center justify-end space-x-1"
                    >
                      <span>View</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
