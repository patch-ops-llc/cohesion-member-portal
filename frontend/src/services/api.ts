import axios, { AxiosError, AxiosInstance } from 'axios';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    // Check for admin API key first (for admin routes)
    const adminApiKey = localStorage.getItem('admin_api_key');
    if (adminApiKey && config.url?.startsWith('/admin')) {
      config.headers['X-API-Key'] = adminApiKey;
    }
    
    // Add JWT token for client routes
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    if (error.response?.status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    const message = error.response?.data?.error || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;

// Helper to set auth token
export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

// Helper to clear auth token
export function clearAuthToken(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
}

// Helper to get stored user
export function getStoredUser(): { id: string; email: string } | null {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

// Helper to store user
export function storeUser(user: { id: string; email: string }): void {
  localStorage.setItem('user', JSON.stringify(user));
}
