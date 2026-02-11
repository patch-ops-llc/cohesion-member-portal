import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getStoredEmail, setStoredEmail, clearStoredEmail } from '../services/api';
import { lookupProjects } from '../services/projects';

interface AuthState {
  isAuthenticated: boolean;
  email: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string) => Promise<boolean>;
  logout: () => void;
}

const defaultContext: AuthContextType = {
  isAuthenticated: false,
  email: null,
  login: async () => false,
  logout: () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const email = getStoredEmail();
    return {
      isAuthenticated: !!email,
      email
    };
  });

  const login = useCallback(async (email: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verify email has projects in HubSpot
    const projects = await lookupProjects(normalizedEmail);
    
    if (projects.length === 0) {
      return false; // No projects found
    }
    
    setStoredEmail(normalizedEmail);
    setState({
      isAuthenticated: true,
      email: normalizedEmail
    });
    
    return true;
  }, []);

  const logout = useCallback(() => {
    clearStoredEmail();
    setState({
      isAuthenticated: false,
      email: null
    });
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout
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
