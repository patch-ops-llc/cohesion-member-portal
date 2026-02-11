import api, {
  setAuthToken,
  setStoredEmail,
  setStoredDisplayName,
  clearAuthToken,
  clearStoredEmail,
  clearStoredDisplayName
} from './api';

export interface ValidateEmailResponse {
  success: boolean;
  email: string;
  needsRegistration: boolean;
  hubspotContactId?: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: { id: string; email: string; displayName?: string };
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export async function validateEmail(email: string): Promise<ValidateEmailResponse> {
  const response = await api.post<ValidateEmailResponse>('/auth/validate-email', { email });
  return response.data;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/register', { email, password });
  const data = response.data;
  setAuthToken(data.token);
  setStoredEmail(data.user.email);
  setStoredDisplayName(data.user.displayName ?? data.user.email);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/login', { email, password });
  const data = response.data;
  setAuthToken(data.token);
  setStoredEmail(data.user.email);
  setStoredDisplayName(data.user.displayName ?? data.user.email);
  return data;
}

export function logout(): void {
  clearAuthToken();
  clearStoredEmail();
  clearStoredDisplayName();
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  const response = await api.post<{ success: boolean; message: string }>('/auth/forgot-password', {
    email
  });
  return response.data;
}

export async function resetPassword(
  token: string,
  password: string
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>('/auth/reset-password', { token, password });
  const data = response.data;
  setAuthToken(data.token);
  setStoredEmail(data.user.email);
  setStoredDisplayName(data.user.displayName ?? data.user.email);
  return data;
}
