import { api, useLoad, type AgentSession, type ClientSession } from './api';
import { sessionRole, useSessionToken } from './auth';

export type Viewer =
  | { kind: 'client' }
  | { kind: 'client-account'; client: ClientSession }
  | { kind: 'checking' }
  | { kind: 'unknown' }
  | { kind: 'realtor'; agent: AgentSession };

export function useViewer(): Viewer {
  const token = useSessionToken();
  const role = token ? sessionRole(token) : null;
  const agentSession = useLoad(role === 'agent' ? `agent|${token}` : null, () =>
    api.agentSession(),
  );
  const clientSession = useLoad(role === 'client' ? `client|${token}` : null, () =>
    api.clientSession(),
  );
  if (role === 'agent') {
    if (agentSession.data) return { kind: 'realtor', agent: agentSession.data };
    if (agentSession.error) return { kind: 'unknown' };
    return { kind: 'checking' };
  }
  if (role === 'client') {
    if (clientSession.data) return { kind: 'client-account', client: clientSession.data };
    if (clientSession.error) return { kind: 'unknown' };
    return { kind: 'checking' };
  }
  return { kind: 'client' };
}
