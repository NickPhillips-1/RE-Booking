import { api, useLoad, type AgentSession, type GuestSession } from './api';
import { sessionRole, useSessionToken } from './auth';

export type Viewer =
  | { kind: 'guest' }
  | { kind: 'guest-account'; guest: GuestSession }
  | { kind: 'checking' }
  | { kind: 'unknown' }
  | { kind: 'realtor'; agent: AgentSession };

export function useViewer(): Viewer {
  const token = useSessionToken();
  const role = token ? sessionRole(token) : null;
  const agentSession = useLoad(role === 'agent' ? `agent|${token}` : null, () =>
    api.agentSession(),
  );
  const guestSession = useLoad(role === 'guest' ? `guest|${token}` : null, () =>
    api.guestSession(),
  );
  if (role === 'agent') {
    if (agentSession.data) return { kind: 'realtor', agent: agentSession.data };
    if (agentSession.error) return { kind: 'unknown' };
    return { kind: 'checking' };
  }
  if (role === 'guest') {
    if (guestSession.data) return { kind: 'guest-account', guest: guestSession.data };
    if (guestSession.error) return { kind: 'unknown' };
    return { kind: 'checking' };
  }
  return { kind: 'guest' };
}
