import api, { setAuthToken, clearAuthToken, storeUser } from './api';

export interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export interface MeResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    createdAt: string;
    lastLogin: string | null;
  };
}

// Request magic link
export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  const response = await api.post('/auth/magic-link', { email });
  return response.data;
}

// Verify magic link token
export async function verifyMagicLink(token: string): Promise<LoginResponse> {
  const response = await api.get(`/auth/verify/${token}`);
  const data = response.data as LoginResponse;
  
  if (data.success && data.token) {
    setAuthToken(data.token);
    storeUser(data.user);
  }
  
  return data;
}

// Get current user
export async function getCurrentUser(): Promise<MeResponse> {
  const response = await api.get('/auth/me');
  return response.data;
}

// Logout
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    clearAuthToken();
  }
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token');
}
