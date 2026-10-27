import { useSyncExternalStore } from 'react';

// Realtor and client sessions share this key. The JWT role says which.
const TOKEN_KEY = 'agent_token';
const listeners = new Set<() => void>();

export type SessionRole = 'agent' | 'client';

export function sessionRole(token: string): SessionRole | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const role = (JSON.parse(json) as { role?: string }).role;
    return role === 'agent' || role === 'client' ? role : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
  listeners.forEach((listener) => listener());
}

export function logOut(): void {
  setToken(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionToken(): string | null {
  return useSyncExternalStore(subscribe, getToken);
}

export function useSessionRole(): SessionRole | null {
  const token = useSessionToken();
  return token ? sessionRole(token) : null;
}

export function useAgentToken(): string | null {
  const token = useSessionToken();
  return token && sessionRole(token) === 'agent' ? token : null;
}

export function useClientToken(): string | null {
  const token = useSessionToken();
  return token && sessionRole(token) === 'client' ? token : null;
}
