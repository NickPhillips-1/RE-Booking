import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { api, ApiError, errorMessage } from '../api';
import { setToken, useSessionRole } from '../auth';
import { Field } from '../ui/Field';

type Form = { name: string; email: string; phone: string; password: string };
type Errors = Partial<Record<keyof Form | 'form', string>>;

const FIELD_BY_HINT: Record<string, keyof Form> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  password: 'password',
};

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email.';
  if (!form.phone.trim()) errors.phone = 'Enter a phone number.';
  if (form.password.length < 8 || form.password.length > 200) {
    errors.password = 'Use 8 to 200 characters.';
  }
  return errors;
}

export default function SignupPage() {
  const role = useSessionRole();
  const [form, setForm] = useState<Form>({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function update(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const session = await api.guestSignup(form);
      setToken(session.token);
    } catch (failure) {
      const field =
        failure instanceof ApiError && failure.hint ? FIELD_BY_HINT[failure.hint] : undefined;
      if (field && failure instanceof ApiError) setErrors({ [field]: failure.message });
      else setErrors({ form: errorMessage(failure) });
      setBusy(false);
    }
  }

  if (role === 'guest') return <Navigate to="/guest" replace />;
  if (role === 'agent') return <Navigate to="/dashboard" replace />;

  return (
    <main className="page">
      <title>Create a guest account</title>
      <div className="section">
        <h1 className="title">Create a guest account</h1>
        <p>Use it to see and cancel appointments you book while logged in.</p>
      </div>
      <form className="fields" onSubmit={submit} noValidate>
        <Field
          id="signup-name"
          label="Name"
          autoComplete="name"
          value={form.name}
          error={errors.name}
          onChange={(event) => update('name', event.target.value)}
        />
        <Field
          id="signup-email"
          label="Email"
          type="email"
          autoComplete="username"
          value={form.email}
          error={errors.email}
          onChange={(event) => update('email', event.target.value)}
        />
        <Field
          id="signup-phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          error={errors.phone}
          onChange={(event) => update('phone', event.target.value)}
        />
        <Field
          id="signup-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          error={errors.password}
          onChange={(event) => update('password', event.target.value)}
        />
        <div>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </div>
        {errors.form && <p className="error">{errors.form}</p>}
        <p>
          <Link to="/login?as=guest">Guest log in</Link>
        </p>
      </form>
    </main>
  );
}
