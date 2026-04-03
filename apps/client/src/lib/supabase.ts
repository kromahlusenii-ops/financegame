import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const API_BASE = import.meta.env.VITE_API_URL || '';

export const supabaseClient = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function signUp(email: string, password: string, displayName: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Sign up failed');
  }

  const data = await res.json();
  setAuth(data.token, data.user);
  return data;
}

export async function signIn(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Sign in failed');
  }

  const data = await res.json();
  setAuth(data.token, data.user);
  return data;
}

export function signOut(): void {
  clearAuth();
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
