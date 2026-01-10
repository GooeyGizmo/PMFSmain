import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'user' | 'admin' | 'owner' | 'operator';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  subscriptionTier: 'payg' | 'access' | 'household' | 'rural';
  defaultAddress: string | null;
  defaultCity: string | null;
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
  resetPassword: (email: string, currentPassword: string, newPassword: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser({
          ...data.user,
          createdAt: new Date(data.user.createdAt),
        });
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser({
          ...data.user,
          createdAt: new Date(data.user.createdAt),
        });
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
      return false;
    }
  };

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser({
          ...data.user,
          createdAt: new Date(data.user.createdAt),
        });
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch (error) {
      console.error('Signup failed:', error);
      setIsLoading(false);
      return false;
    }
  };

  const resetPassword = async (email: string, currentPassword: string, newPassword: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, currentPassword, newPassword }),
      });

      setIsLoading(false);
      return res.ok;
    } catch (error) {
      console.error('Password reset failed:', error);
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser({
          ...data.user,
          createdAt: new Date(data.user.createdAt),
        });
      }
    } catch (error) {
      console.error('Refresh user failed:', error);
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'operator';
  const isOwner = user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, resetPassword, logout, refreshUser, isAdmin, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
