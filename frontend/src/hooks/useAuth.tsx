import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
  validateEmail,
  register as registerUser,
  login as loginUser,
  logout as logoutUser,
  type ValidateEmailResponse
} from '../services/auth';
import api, { getAuthToken, getStoredEmail, getStoredDisplayName, setStoredDisplayName } from '../services/api';

interface AuthState {
  isAuthenticated: boolean;
  email: string | null;
  displayName: string | null;
}

interface AuthContextType extends AuthState {
  validateEmailAndNext: (email: string) => Promise<ValidateEmailResponse | null>;
  register: (email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshFromStorage: () => void;
}

const defaultContext: AuthContextType = {
  isAuthenticated: false,
  email: null,
  displayName: null,
  validateEmailAndNext: async () => null,
  register: async () => false,
  login: async () => false,
  logout: () => {},
  refreshFromStorage: () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = getAuthToken();
    const email = getStoredEmail();
    const displayName = getStoredDisplayName();
    return {
      isAuthenticated: !!token && !!email,
      email: email || null,
      displayName: displayName || null
    };
  });

  const validateEmailAndNext = useCallback(async (email: string): Promise<ValidateEmailResponse | null> => {
    try {
      const result = await validateEmail(email);
      if (result.success) return result;
      return null;
    } catch {
      return null;
    }
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const data = await registerUser(email, password);
      const displayName = data.user.displayName ?? email;
      setState({
        isAuthenticated: true,
        email: email.toLowerCase().trim(),
        displayName
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const data = await loginUser(email, password);
      const displayName = data.user.displayName ?? email;
      setState({
        isAuthenticated: true,
        email: email.toLowerCase().trim(),
        displayName
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setState({ isAuthenticated: false, email: null, displayName: null });
  }, []);

  const refreshFromStorage = useCallback(() => {
    const token = getAuthToken();
    const email = getStoredEmail();
    const displayName = getStoredDisplayName();
    setState({
      isAuthenticated: !!token && !!email,
      email: email || null,
      displayName: displayName || null
    });
  }, []);

  // Refresh display name from /me when we have token but no displayName (e.g. pre-upgrade session)
  useEffect(() => {
    const token = getAuthToken();
    const email = getStoredEmail();
    const displayName = getStoredDisplayName();
    if (token && email && !displayName) {
      api
        .get<{ success: boolean; user: { displayName?: string } }>('/auth/me')
        .then((res) => {
          const name = res.data?.user?.displayName;
          if (name) {
            setStoredDisplayName(name);
            setState((s) => ({ ...s, displayName: name }));
          }
        })
        .catch(() => {});
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    validateEmailAndNext,
    register,
    login,
    logout,
    refreshFromStorage
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

export { AuthContext };
