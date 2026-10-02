import { useState } from 'react';
import type { FormEvent } from 'react';

import { ApiError, apiClient } from '../api/apiClient';

/** Props for LoginPage. */
interface LoginPageProps {
  onLoggedIn: () => void;
}

/**
 * The password form shown until the browser has a session.
 * @param props Called after a successful login.
 * @returns The page.
 */
export function LoginPage(props: LoginPageProps) {
  const { onLoggedIn } = props;
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiClient.logIn(password);
      setPassword('');
      onLoggedIn();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The server could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>Order visualizer</h1>
        <p className="muted">UBI's order engine, read-only, in 3D.</p>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary" disabled={busy || password.length === 0}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
