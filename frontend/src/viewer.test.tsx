import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import { setToken } from './auth';
import { agentSession, clientSession } from './test/fixtures';
import { sessionToken } from './test/session';
import { useViewer } from './viewer';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useViewer', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
  });

  it('treats a missing or unreadable session as a visitor', () => {
    const { result, rerender } = renderHook(() => useViewer());
    expect(result.current).toEqual({ kind: 'client' });
    expect(api.agentSession).not.toHaveBeenCalled();
    expect(api.clientSession).not.toHaveBeenCalled();

    act(() => setToken('not-a-session'));
    rerender();
    expect(result.current).toEqual({ kind: 'client' });
    expect(api.agentSession).not.toHaveBeenCalled();
  });

  it('loads the realtor once an agent session resolves', async () => {
    const pending = deferred<typeof agentSession>();
    vi.mocked(api.agentSession).mockReturnValue(pending.promise);
    setToken(sessionToken('agent'));

    const { result } = renderHook(() => useViewer());
    expect(result.current).toEqual({ kind: 'checking' });
    expect(api.clientSession).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(agentSession);
    });
    expect(result.current).toEqual({ kind: 'realtor', agent: agentSession });
  });

  it('loads the client account for a client session', async () => {
    setToken(sessionToken('client'));
    const { result } = renderHook(() => useViewer());
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'client-account', client: clientSession }),
    );
    expect(api.agentSession).not.toHaveBeenCalled();
  });

  it('asks the page to log out when the session cannot be confirmed', async () => {
    vi.mocked(api.clientSession).mockRejectedValue(new ApiError(500, 'error', 'nope'));
    setToken(sessionToken('client'));
    const { result } = renderHook(() => useViewer());
    await waitFor(() => expect(result.current).toEqual({ kind: 'unknown' }));
  });
});
