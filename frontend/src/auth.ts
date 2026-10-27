import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'session_token';
const LEGACY_TOKEN_KEY = 'agent_token';
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
  const token = sessionStorage.getItem(TOKEN_KEY);
  const legacy = sessionStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy !== null) {
    if (token === null) sessionStorage.setItem(TOKEN_KEY, legacy);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  return token ?? legacy;
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);
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
