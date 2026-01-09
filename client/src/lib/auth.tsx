import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type UserRole = 'user' | 'admin' | 'owner' | 'operator';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  role: UserRole;
  subscriptionTier: 'payg' | 'access' | 'household' | 'rural';
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const OWNER_EMAIL = 'levi.ernst@prairiemobilefuel.ca';

const mockUsers: Record<string, { password: string; user: User }> = {
  'levi.ernst@prairiemobilefuel.ca': {
    password: 'admin123',
    user: {
      id: '1',
      email: 'levi.ernst@prairiemobilefuel.ca',
      name: 'Levi Ernst',
      phone: '(306) 555-0100',
      address: '123 Prairie Way',
      city: 'Regina',
      state: 'SK',
      zip: 'S4P 1A1',
      role: 'owner',
      subscriptionTier: 'rural',
      createdAt: new Date('2024-01-01'),
    },
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('pmf_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        parsed.createdAt = new Date(parsed.createdAt);
        setUser(parsed);
      } catch {
        localStorage.removeItem('pmf_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    
    const normalizedEmail = email.toLowerCase().trim();
    const storedUsers = JSON.parse(localStorage.getItem('pmf_registered_users') || '{}');
    const allUsers = { ...mockUsers, ...storedUsers };
    
    const userData = allUsers[normalizedEmail];
    if (userData && userData.password === password) {
      setUser(userData.user);
      localStorage.setItem('pmf_user', JSON.stringify(userData.user));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  };

  const signup = async (email: string, password: string, name: string): Promise<boolean> => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    
    const normalizedEmail = email.toLowerCase().trim();
    const storedUsers = JSON.parse(localStorage.getItem('pmf_registered_users') || '{}');
    const allUsers = { ...mockUsers, ...storedUsers };
    
    if (allUsers[normalizedEmail]) {
      setIsLoading(false);
      return false;
    }
    
    const isOwnerEmail = normalizedEmail === OWNER_EMAIL;
    const newUser: User = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name,
      role: isOwnerEmail ? 'owner' : 'user',
      subscriptionTier: 'payg',
      createdAt: new Date(),
    };
    
    storedUsers[normalizedEmail] = { password, user: newUser };
    localStorage.setItem('pmf_registered_users', JSON.stringify(storedUsers));
    localStorage.setItem('pmf_user', JSON.stringify(newUser));
    setUser(newUser);
    setIsLoading(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pmf_user');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'operator';
  const isOwner = user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, isAdmin, isOwner }}>
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
