import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FolderOpen, 
  FileText, 
  Bell,
  LogOut, 
  Menu, 
  X,
  ChevronLeft
} from 'lucide-react';
import clsx from 'clsx';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { path: '/admin/projects', icon: FolderOpen, label: 'Projects' },
  { path: '/admin/audit-log', icon: FileText, label: 'Audit Log' },
  { path: '/admin/notifications', icon: Bell, label: 'Notifications' }
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('admin_api_key');
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 w-64 bg-primary text-white z-50 transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-primary-800">
          <Link to="/admin" className="flex items-center space-x-2">
            <FileText className="h-6 w-6" />
            <span className="font-bold">Admin Portal</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-primary-800 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-800">
          <Link
            to="/"
            className="flex items-center space-x-3 px-4 py-3 text-white/70 hover:text-white rounded-lg hover:bg-white/5 mb-2"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>Client Portal</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 text-white/70 hover:text-white rounded-lg hover:bg-white/5 w-full"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="bg-white shadow-sm h-16 flex items-center px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 mr-4 text-gray-600 hover:text-gray-900"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            {navItems.find(item => 
              item.exact 
                ? location.pathname === item.path 
                : location.pathname.startsWith(item.path)
            )?.label || 'Admin'}
          </h1>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
