import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api';
import { setToken, useSessionRole } from '../auth';
import { ChoiceChips } from '../ui/ChoiceChips';
import { Field } from '../ui/Field';

type Account = 'realtor' | 'client';

export default function LoginPage() {
  const role = useSessionRole();
  const [params] = useSearchParams();
  const [account, setAccount] = useState<Account>(() =>
    params.get('as') === 'client' ? 'client' : 'realtor',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(next: string) {
    setAccount(next === 'client' ? 'client' : 'realtor');
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session =
        account === 'client'
          ? await api.clientLogin(email, password)
          : await api.login(email, password);
      setToken(session.token);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'invalid_login'
          ? 'Email or password is wrong.'
          : errorMessage(failure),
      );
      setBusy(false);
    }
  }

  if (role === 'agent') return <Navigate to="/dashboard" replace />;
  if (role === 'client') return <Navigate to="/client" replace />;

  const title = account === 'client' ? 'Client log in' : 'Realtor log in';

  return (
    <main className="page">
      <title>{title}</title>
      <div className="section">
        <h1 className="title">{title}</h1>
        <div className="stack">
          <p className="label">Log in as</p>
          <ChoiceChips
            label="Log in as"
            options={[
              { value: 'realtor', label: 'Realtor' },
              { value: 'client', label: 'Client' },
            ]}
            selected={account}
            onSelect={choose}
          />
        </div>
        <p>
          {account === 'client'
            ? 'See and cancel appointments you book while logged in.'
            : 'Hours, meetings, and the schedule.'}
        </p>
      </div>
      <form className="fields" onSubmit={submit}>
        <Field
          id="login-email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div>
          <button className="button primary" type="submit" disabled={busy}>
            Log in
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
