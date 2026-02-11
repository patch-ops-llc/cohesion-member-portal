import axios, { AxiosError, AxiosInstance } from 'axios';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token and admin API key
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const adminApiKey = localStorage.getItem('admin_api_key');
    if (adminApiKey && config.url?.startsWith('/admin')) {
      config.headers['X-API-Key'] = adminApiKey;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 (clear token, redirect to login)
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_display_name');
      // Let the app handle redirect via ProtectedRoute
    }
    const message = error.response?.data?.error || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;

// Auth token helpers
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_display_name');
}

// User email (stored after login for display)
export function getStoredEmail(): string | null {
  return localStorage.getItem('user_email');
}

export function setStoredEmail(email: string): void {
  localStorage.setItem('user_email', email.toLowerCase().trim());
}

export function clearStoredEmail(): void {
  localStorage.removeItem('user_email');
}

// User display name (firstName lastName from HubSpot, falls back to email)
export function getStoredDisplayName(): string | null {
  return localStorage.getItem('user_display_name');
}

export function setStoredDisplayName(displayName: string): void {
  localStorage.setItem('user_display_name', displayName);
}

export function clearStoredDisplayName(): void {
  localStorage.removeItem('user_display_name');
}
