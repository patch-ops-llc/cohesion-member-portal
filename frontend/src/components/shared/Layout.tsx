import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const COHESION_LOGO_URL = 'https://cohesionco.com/wp-content/uploads/2025/10/Cohesion-logo-with-trademark-1.png';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isAuthenticated, displayName, email, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-100 border-b border-slate-200 shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <img 
                src={COHESION_LOGO_URL} 
                alt="Cohesion" 
                className="h-10 w-auto"
              />
            </Link>

            {/* User menu */}
            {isAuthenticated && (displayName || email) && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-slate-600 hidden sm:block">
                  {displayName || email}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Cohesion Document Portal. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
