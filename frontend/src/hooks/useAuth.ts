import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { isAuthenticated, getCurrentUser, logout as logoutApi } from '../services/auth';
import { getStoredUser } from '../services/api';
import type { AuthState, User } from '../types';

interface AuthContextType extends AuthState {
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const defaultContext: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,
  login: () => {},
  logout: async () => {},
  checkAuth: async () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null
  });

  const checkAuth = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      if (isAuthenticated()) {
        const storedUser = getStoredUser();
        if (storedUser) {
          // Verify token is still valid
          const response = await getCurrentUser();
          setState({
            isAuthenticated: true,
            isLoading: false,
            user: { id: response.user.id, email: response.user.email },
            token: localStorage.getItem('auth_token')
          });
          return;
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
    
    setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      token: null
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback((token: string, user: User) => {
    setState({
      isAuthenticated: true,
      isLoading: false,
      user,
      token
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        token: null
      });
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    checkAuth
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
