import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Auth components
import { MagicLinkForm } from './components/auth/MagicLinkForm';
import { VerifyLink } from './components/auth/VerifyLink';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Shared components
import { Layout } from './components/shared/Layout';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

// Portal components
import { ProjectList } from './components/portal/ProjectList';
import { ProjectDetail } from './components/portal/ProjectDetail';

// Admin components
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLogin } from './components/admin/AdminLogin';
import { Dashboard } from './components/admin/Dashboard';
import { ProjectManager } from './components/admin/ProjectManager';
import { ProjectEditor } from './components/admin/ProjectEditor';
import { AuditLog } from './components/admin/AuditLog';

// Auth provider
import { AuthProvider, AuthContext } from './hooks/useAuth';

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// Admin route guard
function AdminRoute({ children }: { children: React.ReactNode }) {
  const apiKey = localStorage.getItem('admin_api_key');
  
  if (!apiKey) {
    return <Navigate to="/admin/login" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProviderWrapper>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/verify/:token" element={<VerifyLink />} />

              {/* Protected client routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ProjectList />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/project/:projectId"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ProjectDetail />
                    </Layout>
                  </ProtectedRoute>
                }
              />

              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Dashboard />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/projects"
                element={
                  <AdminRoute>
                    <ProjectManager />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/projects/:projectId"
                element={
                  <AdminRoute>
                    <ProjectEditor />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/audit-log"
                element={
                  <AdminRoute>
                    <AuditLog />
                  </AdminRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProviderWrapper>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Wrapper to provide auth context
function AuthProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}

// Login page wrapper
function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <MagicLinkForm />
      </div>
    </div>
  );
}

export default App;
