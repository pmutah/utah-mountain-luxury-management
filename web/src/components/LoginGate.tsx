import { useEffect, useState, type ReactNode } from 'react';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';
import { api } from '../lib/api';
import { BrandMark } from './BrandMark';

export function LoginGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const muse = params.get('muse')?.trim();
    if (muse) {
      const next = `${window.location.pathname}${window.location.hash || ''}` || '/';
      window.location.replace(
        `/api/muse/enter?token=${encodeURIComponent(muse)}&next=${encodeURIComponent(next)}`,
      );
      return;
    }
    api
      .getSession()
      .then((s) => {
        setAuthRequired(s.authRequired);
        setAuthenticated(s.authenticated);
      })
      .catch(() => setAuthenticated(import.meta.env.DEV))
      .finally(() => setChecking(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.login(password);
      setAuthenticated(res.authenticated);
      setAuthRequired(res.authRequired);
    } catch {
      setError('Invalid password');
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--uml-bg)] flex items-center justify-center text-[var(--uml-muted)] text-sm tracking-widest uppercase">
        Checking access…
      </div>
    );
  }

  if (!authRequired || authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[var(--uml-bg)] text-[var(--uml-ink)] flex items-center justify-center p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="uml-panel w-full max-w-sm rounded-[32px] p-8 shadow-xl space-y-6"
      >
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Sign in</p>
            <h1 className="font-display text-3xl">{APP_NAME.replace(' Management', '')}</h1>
            <p className="font-display italic text-sm text-[var(--uml-muted)]">{APP_TAGLINE}</p>
          </div>
        </div>
        <input
          type="password"
          data-bot="login-password"
          name="password"
          aria-label="Dashboard password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Dashboard password"
          className="w-full bg-transparent border border-[var(--uml-line)] rounded-2xl px-4 py-3 text-[var(--uml-ink)] outline-none focus:ring-1 focus:ring-[var(--uml-gold)]"
          autoComplete="current-password"
        />
        {error && <p className="text-red-400 text-sm font-bold">{error}</p>}
        <button
          type="submit"
          data-bot="login-submit"
          className="uml-gold-btn w-full py-3 rounded-full text-sm uppercase tracking-widest"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
