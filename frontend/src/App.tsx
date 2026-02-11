import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Auth components
import { EmailLookupForm } from './components/auth/EmailLookupForm';
import { SetPasswordForm } from './components/auth/SetPasswordForm';
import { LoginForm } from './components/auth/LoginForm';
import { ForgotPasswordForm } from './components/auth/ForgotPasswordForm';
import { ResetPasswordForm } from './components/auth/ResetPasswordForm';
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
import { AuthProvider } from './hooks/useAuth';

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
          <AuthProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

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
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Login page - multi-step: email → register or login
function LoginPage() {
  const [step, setStep] = React.useState<'email' | 'register' | 'login' | 'forgot'>('email');
  const [email, setEmail] = React.useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        {step === 'email' && (
          <EmailLookupForm
            onValidated={(e, needsRegistration) => {
              setEmail(e);
              setStep(needsRegistration ? 'register' : 'login');
            }}
          />
        )}
        {step === 'register' && (
          <SetPasswordForm
            email={email}
            onBack={() => setStep('email')}
          />
        )}
        {step === 'login' && (
          <LoginForm
            email={email}
            onBack={() => setStep('email')}
            onForgotPassword={() => setStep('forgot')}
          />
        )}
        {step === 'forgot' && (
          <ForgotPasswordForm
            email={email}
            onBack={() => setStep('login')}
          />
        )}
      </div>
    </div>
  );
}

// Reset password page (from email link)
function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <ResetPasswordForm />
      </div>
    </div>
  );
}

export default App;
