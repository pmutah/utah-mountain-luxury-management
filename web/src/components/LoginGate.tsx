import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';
import { api } from '../lib/api';
import { BrandMark } from './BrandMark';

/**
 * Google Identity Services, loaded from Google.
 *
 * It is loaded lazily and only when the login screen actually needs it: a signed-in host should not
 * pay for a third-party script, and a deployment with no Google client id must not request one.
 */
type GoogleCredentialResponse = { credential?: string };
type GoogleButtonOptions = {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
};
type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (options: GoogleButtonOptions) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Load the Google script once, and resolve when `window.google` is ready. */
function loadGoogle(): Promise<GoogleAccounts | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google) return Promise.resolve(window.google);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const done = () => resolve(window.google ?? null);
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', done, { once: true });
    // Google being unreachable must leave the password form usable, not break the page.
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.appendChild(script);
  });
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailSignIn, setEmailSignIn] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const buttonHost = useRef<HTMLDivElement | null>(null);

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
        setOpen(Boolean((s as { open?: boolean }).open));
      })
      .catch(() => setAuthenticated(import.meta.env.DEV))
      .finally(() => setChecking(false));
  }, []);

  // Only the signed-out screen asks how it should sign people in.
  useEffect(() => {
    if (checking || authenticated || open) return;
    api
      .getLoginOptions()
      .then((options) => {
        setEmailSignIn(options.emailSignIn && Boolean(options.googleClientId));
        setClientId(options.googleClientId);
        setSummary(options.summary);
      })
      .catch(() => setEmailSignIn(false));
  }, [checking, authenticated, open]);

  // Draw Google's own button. Rendering it ourselves would mean a click that does not carry Google's
  // credential, which is the one thing the server can verify.
  useEffect(() => {
    if (!emailSignIn || !clientId || !buttonHost.current) return;
    let cancelled = false;
    void loadGoogle().then((google) => {
      if (cancelled || !google || !buttonHost.current) {
        if (!google) setGoogleFailed(true);
        return;
      }
      google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: (response) => {
          const credential = response.credential ?? '';
          if (!credential) {
            setError('Google did not return a sign-in. Try again.');
            return;
          }
          void api
            .loginWithGoogle(credential)
            .then((res) => {
              setAuthenticated(res.authenticated);
              setAuthRequired(res.authRequired);
            })
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : '';
              setError(message || 'That email address does not have access to this dashboard.');
            });
        },
      });
      google.accounts.id.renderButton(buttonHost.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 280,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [emailSignIn, clientId]);

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

  // Nothing is protecting this deployment, so showing the dashboard would only render errors.
  if (open) {
    return (
      <div className="min-h-screen bg-[var(--uml-bg)] text-[var(--uml-ink)] flex items-center justify-center p-6">
        <div className="uml-panel w-full max-w-lg rounded-[32px] p-8 shadow-xl space-y-4" data-bot="login-unconfigured">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="uml-kicker">Setup needed</p>
              <h1 className="font-display text-3xl">{APP_NAME.replace(' Management', '')}</h1>
            </div>
          </div>
          <p className="text-sm">
            This site has no way to sign anyone in yet, so private data stays closed. The ledger, the booking
            list, guest details, and the document vault will not load until{' '}
            <code className="rounded bg-black/10 px-1">SESSION_SECRET</code> and{' '}
            <code className="rounded bg-black/10 px-1">GOOGLE_OAUTH_CLIENT_ID</code> are set in Cloudflare
            Pages, and the site is redeployed.
          </p>
          <p className="text-sm text-[var(--uml-muted)]">
            Nothing was written or deleted. The public booking page and any guest stay link keep working.
          </p>
        </div>
      </div>
    );
  }

  if (!authRequired || authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[var(--uml-bg)] text-[var(--uml-ink)] flex items-center justify-center p-6">
      <div className="uml-panel w-full max-w-sm rounded-[32px] p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Sign in</p>
            <h1 className="font-display text-3xl">{APP_NAME.replace(' Management', '')}</h1>
            <p className="font-display italic text-sm text-[var(--uml-muted)]">{APP_TAGLINE}</p>
          </div>
        </div>

        {emailSignIn && (
          <div className="space-y-3">
            <div ref={buttonHost} data-bot="login-google" className="flex justify-center" />
            {googleFailed && (
              <p className="text-xs text-[var(--uml-muted)]" data-bot="login-google-unavailable">
                Google sign-in could not load. Use the dashboard password below.
              </p>
            )}
            {summary && (
              <p className="text-xs text-[var(--uml-muted)]" data-bot="login-summary">
                {summary} Ask Brandon if your address should be on the list.
              </p>
            )}
          </div>
        )}

        {emailSignIn && <div className="h-px bg-[var(--uml-line)]" />}

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
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
          {error && (
            <p className="text-red-400 text-sm font-bold" data-bot="login-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-bot="login-submit"
            className="uml-gold-btn w-full py-3 rounded-full text-sm uppercase tracking-widest"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
