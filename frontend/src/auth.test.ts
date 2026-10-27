import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getToken,
  logOut,
  sessionRole,
  setToken,
  useAgentToken,
  useClientToken,
  useSessionRole,
  useSessionToken,
} from './auth';
import { sessionToken } from './test/session';

describe('sessionRole', () => {
  it('reads an agent or client role from the payload', () => {
    expect(sessionRole(sessionToken('agent'))).toBe('agent');
    expect(sessionRole(sessionToken('client'))).toBe('client');
  });

  it('pads a url-safe payload before decoding it', () => {
    const token = sessionToken('agent');
    const payload = token.split('.')[1] ?? '';
    expect(payload).not.toMatch(/[+/=]/);
    expect(payload.length % 4).not.toBe(0);
    expect(sessionRole(token)).toBe('agent');
  });

  it('decodes characters that url-safe base64 rewrites', () => {
    const payload = btoa(JSON.stringify({ role: 'client', email: 'a+b/c@example.com' }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(payload).not.toMatch(/[+/=]/);
    expect(sessionRole(`h.${payload}.s`)).toBe('client');
  });

  it('returns null when the payload is not an object', () => {
    const payload = btoa('{').replace(/=+$/, '');
    expect(sessionRole(`x.${payload}.y`)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['one part', 'abc'],
    ['not base64', 'a.!!!.c'],
    ['empty payload', 'a..c'],
    ['unknown role', sessionToken('realtor')],
    ['wrong case', sessionToken('Agent')],
  ])('returns null for a %s token', (_label, token) => {
    expect(sessionRole(token)).toBeNull();
  });
});

describe('session storage', () => {
  it('moves a token saved under the previous key', () => {
    const token = sessionToken('agent');
    sessionStorage.setItem('agent_token', token);
    expect(getToken()).toBe(token);
    expect(sessionStorage.getItem('agent_token')).toBeNull();
    expect(sessionStorage.getItem('session_token')).toBe(token);
  });

  it('keeps the current token when an older one is also stored', () => {
    const current = sessionToken('client');
    sessionStorage.setItem('session_token', current);
    sessionStorage.setItem('agent_token', sessionToken('agent'));
    expect(getToken()).toBe(current);
    expect(sessionStorage.getItem('agent_token')).toBeNull();
    expect(sessionStorage.getItem('session_token')).toBe(current);
  });

  it('clears both keys on log out', () => {
    sessionStorage.setItem('agent_token', sessionToken('agent'));
    logOut();
    expect(sessionStorage.getItem('agent_token')).toBeNull();
    expect(sessionStorage.getItem('session_token')).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('keeps one token and tells subscribers which role it is', () => {
    const { result } = renderHook(() => ({
      token: useSessionToken(),
      role: useSessionRole(),
      agent: useAgentToken(),
      client: useClientToken(),
    }));
    expect(result.current).toEqual({ token: null, role: null, agent: null, client: null });

    const agent = sessionToken('agent');
    act(() => setToken(agent));
    expect(getToken()).toBe(agent);
    expect(result.current).toEqual({ token: agent, role: 'agent', agent, client: null });

    const client = sessionToken('client');
    act(() => setToken(client));
    expect(result.current).toEqual({ token: client, role: 'client', agent: null, client });

    act(() => logOut());
    expect(getToken()).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('moves a token stored under the previous key', () => {
    const token = sessionToken('client');
    sessionStorage.setItem('agent_token', token);
    expect(getToken()).toBe(token);
    expect(sessionStorage.getItem('agent_token')).toBeNull();
    expect(sessionStorage.getItem('session_token')).toBe(token);
  });
});
