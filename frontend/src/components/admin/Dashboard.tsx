import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Clock, CheckCircle, Upload } from 'lucide-react';
import api from '../../services/api';
import { InlineLoader } from '../shared/LoadingSpinner';

interface Stats {
  totalProjects: number;
  activeProjects: number;
  pendingReviewCount: number;
  recentUploads: number;
}

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; stats: Stats }>('/admin/stats');
      return response.data.stats;
    }
  });

  if (isLoading) {
    return <InlineLoader message="Loading dashboard..." />;
  }

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={FolderOpen}
          label="Total Projects"
          value={stats?.totalProjects || 0}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Active Projects"
          value={stats?.activeProjects || 0}
          color="green"
        />
        <StatCard
          icon={Clock}
          label="Pending Review"
          value={stats?.pendingReviewCount || 0}
          color="amber"
        />
        <StatCard
          icon={Upload}
          label="Recent Uploads (7d)"
          value={stats?.recentUploads || 0}
          color="purple"
        />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/admin/projects?filter=pending"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary-50 transition-colors"
          >
            <Clock className="h-5 w-5 text-amber-500" />
            <span className="font-medium">Review Pending Documents</span>
          </a>
          <a
            href="/admin/projects"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary-50 transition-colors"
          >
            <FolderOpen className="h-5 w-5 text-blue-500" />
            <span className="font-medium">Browse All Projects</span>
          </a>
          <a
            href="/admin/audit-log"
            className="flex items-center space-x-3 p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-primary-50 transition-colors"
          >
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="font-medium">View Activity Log</span>
          </a>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: typeof FolderOpen;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'purple';
}

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600'
};

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
