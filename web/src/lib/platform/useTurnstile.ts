/**
 * The Turnstile widget on the booking page.
 *
 * Cloudflare's script is loaded only when the server says a check is enforced, so an unconfigured deployment loads nothing
 * and the form keeps working. The token is held here and sent with the request.
 *
 * The host node is held in **state**, not a ref, because the form is conditionally rendered: a guest only sees it after the
 * party count, the house rules, and the agreement topics are done. With a ref, the widget's effect ran once while the form
 * was still hidden, found no node, and never ran again — so the check never drew and the button stayed disabled with nothing
 * explaining why. A callback ref re-runs the effect when the node actually appears.
 *
 * The visible states are deliberate:
 *   - not enforced: nothing is drawn, and the response says no bot check ran.
 *   - enforced, script blocked: the form says the check could not load, so a guest knows why the button will not work.
 */

import { useCallback, useEffect, useState } from 'react';

type TurnstileConfig = { siteKey: string | null; enforced: boolean; action: string };

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'auto' | 'light' | 'dark';
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function useTurnstile(action: string) {
  const [config, setConfig] = useState<TurnstileConfig | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const [widgetId, setWidgetId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch('/api/book/turnstile')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: TurnstileConfig) => {
        if (!cancel) setConfig(body);
      })
      .catch(() => {
        if (!cancel) setConfig({ siteKey: null, enforced: false, action });
      });
    return () => {
      cancel = true;
    };
  }, [action]);

  useEffect(() => {
    if (!config?.enforced || !config.siteKey || !node) return;
    if (node.childElementCount > 0) return;
    let cancel = false;
    void loadScript().then(() => {
      if (cancel) return;
      if (!window.turnstile) {
        setFailed(true);
        return;
      }
      const id = window.turnstile.render(node, {
        sitekey: config.siteKey!,
        action: config.action,
        theme: 'dark',
        callback: (value) => setToken(value),
        'expired-callback': () => setToken(''),
        'error-callback': () => {
          setToken('');
          setFailed(true);
        },
      });
      setWidgetId(id);
    });
    return () => {
      cancel = true;
    };
  }, [config?.enforced, config?.siteKey, config?.action, node]);

  /** Attach to the node the widget draws into. */
  const host = useCallback((element: HTMLDivElement | null) => setNode(element), []);

  return {
    /** True when a secret exists on the server, so a token is required. */
    enforced: Boolean(config?.enforced),
    token,
    failed,
    host,
    /** Call after a refusal so the guest can try again with a fresh token. */
    reset: () => {
      setToken('');
      if (window.turnstile && widgetId) window.turnstile.reset(widgetId);
    },
  };
}
