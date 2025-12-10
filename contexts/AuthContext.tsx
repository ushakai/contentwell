import React, { createContext, useState, useEffect, useRef, ReactNode } from 'react';
import { getSession, validateUserExists, clearSession, User, AuthSession } from '../services/authService';

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const previousSessionRef = useRef<AuthSession | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      if (!mountedRef.current) return;
      
      const currentSession = getSession();
      
      // If no session, clear state
      if (!currentSession) {
        if (previousSessionRef.current) {
          previousSessionRef.current = null;
          setSession(null);
          setUser(null);
        }
        if (loading) {
          setLoading(false);
        }
        return;
      }
      
      // Validate user exists in database
      const userExists = await validateUserExists(currentSession.user.id);
      
      if (!userExists) {
        console.warn('[AuthContext] User from session does not exist in database, clearing session');
        clearSession();
        if (mountedRef.current) {
          previousSessionRef.current = null;
          setSession(null);
          setUser(null);
        }
        if (loading) {
          setLoading(false);
        }
        return;
      }
      
      // Only update if session actually changed
      const prevUserId = previousSessionRef.current?.user?.id;
      const prevToken = previousSessionRef.current?.access_token;
      const currUserId = currentSession?.user?.id;
      const currToken = currentSession?.access_token;
      
      if (prevUserId !== currUserId || prevToken !== currToken) {
        previousSessionRef.current = currentSession;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      }
      
      if (loading) {
        setLoading(false);
      }
    };

    // Initial check
    checkSession();

    // Check session on storage events (for multi-tab support)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_session' && mountedRef.current) {
        checkSession();
      }
    };

    // Poll session every 10 seconds in background to check expiration
    const interval = setInterval(() => {
      if (!mountedRef.current) return;
      checkSession();
    }, 10000);

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [loading]);

  const value = {
    user,
    session,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};