import { supabase } from '../utils/supabaseClient';
export interface User {
  id: string;
  name: string | null;
  contact_email: string | null;
  sector: string | null;
  created_at: string;
}

export interface AuthSession {
  user: User;
  access_token: string;
  expires_at: number;
}

const SESSION_STORAGE_KEY = 'auth_session';
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Generate a simple token (in production, use a more secure method)
const generateToken = (): string => {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Hash password using Web crypto API (browser-compatible)
 * This creates a simple hash that is stored in public.user.password_hash
 * Format: "salt:hash" (both are hex strings)
 */
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Add salt and hash again for better security
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltedData = encoder.encode(hashHex + saltHex);
  const finalHashBuffer = await crypto.subtle.digest('SHA-256', saltedData);
  const finalHashArray = Array.from(new Uint8Array(finalHashBuffer));
  const finalHashHex = finalHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Store as salt:hash for verification
  return `${saltHex}:${finalHashHex}`;
};

/**
 * Verify password by hashing the input password and comparing with stored hash
 * This is called during login to check if the password matches
 */
const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [saltHex, storedHashHex] = storedHash.split(':');
  if (!saltHex || !storedHashHex) return false;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const saltedData = encoder.encode(hashHex + saltHex);
  const finalHashBuffer = await crypto.subtle.digest('SHA-256', saltedData);
  const finalHashArray = Array.from(new Uint8Array(finalHashBuffer));
  const finalHashHex = finalHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return finalHashHex === storedHashHex;
};

// Validate that user exists in database
export const validateUserExists = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('user')
      .select('id')
      .eq('id', userId)
      .single();
    
    return !error && !!data;
  } catch {
    return false;
  }
};

// Get current session from localStorage
export const getSession = (): AuthSession | null => {
  try {
    const sessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionStr) return null;
    
    const session: AuthSession = JSON.parse(sessionStr);
    
    // Check if session is expired
    if (session.expires_at < Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
};

// Save session to localStorage
const saveSession = (session: AuthSession): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

// Remove session from localStorage
export const clearSession = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
};

// Sign up a new user
export const signUp = async (
  email: string,
  password: string,
  name: string
): Promise<{ user: User; error: null } | { user: null; error: string }> => {
  try {
    // Check if user already exists
    const { data: existingUsers, error: checkError } = await supabase
      .from('user')
      .select('contact_email')
      .eq('contact_email', email.toLowerCase().trim());

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      return { user: null, error: checkError.message };
    }

    if (existingUsers && existingUsers.length > 0) {
      return { user: null, error: 'User with this email already exists' };
    }

    // Hash password - this creates a simple hash stored in public.user.password_hash
    const password_hash = await hashPassword(password);

    // Create user with hashed password stored in public.user table
    const { data: newUser, error } = await supabase
      .from('user')
      .insert({
        contact_email: email.toLowerCase().trim(),
        password_hash, // Stored as hash in public.user.password_hash
        name: name.trim(),
      })
      .select()
      .single();

    if (error) {
      return { user: null, error: error.message };
    }

    if (!newUser) {
      return { user: null, error: 'Failed to create user' };
    }

    // Create session
    const user: User = {
      id: newUser.id,
      name: newUser.name,
      contact_email: newUser.contact_email,
      sector: newUser.sector,
      created_at: newUser.created_at,
    };

    const session: AuthSession = {
      user,
      access_token: generateToken(),
      expires_at: Date.now() + SESSION_DURATION,
    };

    saveSession(session);

    return { user, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Failed to sign up' };
  }
};

// Sign in existing user
export const signIn = async (
  email: string,
  password: string
): Promise<{ user: User; error: null } | { user: null; error: string }> => {
  try {
    // Find user by email
    const { data: userData, error } = await supabase
      .from('user')
      .select('*')
      .eq('contact_email', email.toLowerCase().trim())
      .single();

    if (error) {
      // If user not found or other error, return generic message for security
      if (error.code === 'PGRST116') {
        return { user: null, error: 'Invalid email or password' };
      }
      return { user: null, error: 'Invalid email or password' };
    }

    if (!userData) {
      return { user: null, error: 'Invalid email or password' };
    }

    if (!userData.password_hash) {
      return { user: null, error: 'Invalid email or password' };
    }

    // Verify password: hash the input password and compare with stored hash from public.user.password_hash
    const isValid = await verifyPassword(password, userData.password_hash);
    if (!isValid) {
      return { user: null, error: 'Invalid email or password' };
    }

    // Create session
    const user: User = {
      id: userData.id,
      name: userData.name,
      contact_email: userData.contact_email,
      sector: userData.sector,
      created_at: userData.created_at,
    };

    const session: AuthSession = {
      user,
      access_token: generateToken(),
      expires_at: Date.now() + SESSION_DURATION,
    };

    saveSession(session);

    return { user, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Failed to sign in' };
  }
};

// Sign out
export const signOut = (): void => {
  clearSession();
};

