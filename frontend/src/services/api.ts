import axios, { AxiosError, AxiosInstance } from 'axios';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add admin API key for admin routes
api.interceptors.request.use(
  (config) => {
    const adminApiKey = localStorage.getItem('admin_api_key');
    if (adminApiKey && config.url?.startsWith('/admin')) {
      config.headers['X-API-Key'] = adminApiKey;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    const message = error.response?.data?.error || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;

// Helper to get/set stored email
export function getStoredEmail(): string | null {
  return localStorage.getItem('user_email');
}

export function setStoredEmail(email: string): void {
  localStorage.setItem('user_email', email.toLowerCase().trim());
}

export function clearStoredEmail(): void {
  localStorage.removeItem('user_email');
}
