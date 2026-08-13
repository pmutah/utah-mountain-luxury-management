import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';
import { api } from '../lib/api';

export function LoginGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm font-bold uppercase tracking-widest">
        Checking access…
      </div>
    );
  }

  if (!authRequired || authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-[32px] p-8 shadow-xl space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 rounded-2xl">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Sign in</h1>
            <p className="text-xs text-slate-500 font-bold uppercase">{APP_NAME}</p>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{APP_TAGLINE}</p>
          </div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Dashboard password"
          className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 font-bold text-white outline-none focus:ring-2 focus:ring-blue-600"
          autoComplete="current-password"
        />
        {error && <p className="text-red-400 text-sm font-bold">{error}</p>}
        <button
          type="submit"
          className="w-full py-3 bg-blue-600 rounded-2xl text-sm font-black uppercase tracking-widest text-white"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
