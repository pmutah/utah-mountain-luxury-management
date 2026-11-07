import { useCallback, useEffect, useState } from 'react';

type Ready = { id: string; when: string; subject: string };
type Sentinel = { id: string; at: string; to: string };

/**
 * The messages a stay may receive today, and a button to send one.
 *
 * The timeline was a preview for a long time: a host could read the seven messages and nothing ever
 * went out. This sends exactly one, by hand, and only the ones the server says are right for today.
 *
 * The server decides what is ready, so this makes no judgement of its own: a message that is too early,
 * already sent, or would carry a code is simply not on the list. Nothing here sends on its own.
 */
export function StayMessageSender({ token, email }: { token: string; email: string }) {
  const [ready, setReady] = useState<Ready[] | null>(null);
  const [sent, setSent] = useState<Sentinel[]>([]);
  const [line, setLine] = useState<string | null>(null);
  const [to, setTo] = useState(email);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch(`/api/stay-guide/${encodeURIComponent(token)}/stay-message`)
      .then(async (res) => {
        if (!res.ok) {
          setReady(null);
          setLine('The messages for this stay could not be read. This is not an empty list.');
          return;
        }
        const body = (await res.json()) as { ready?: Ready[]; sent?: Sentinel[]; line?: string };
        setReady(Array.isArray(body.ready) ? body.ready : null);
        setSent(Array.isArray(body.sent) ? body.sent : []);
        setLine(body.line ?? null);
      })
      .catch(() => {
        setReady(null);
        setLine('The messages for this stay could not be read. This is not an empty list.');
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(id: string) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/stay-guide/${encodeURIComponent(token)}/stay-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, to }),
      });
      const body = (await res.json().catch(() => null)) as { line?: string; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'The message did not send.');
      setNotice(body?.line ?? 'Sent.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The message did not send.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-slate-700 p-3" data-bot="stay-message-sender">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guest messages</p>
      {line && (
        <p className="text-xs text-slate-400" data-bot="stay-message-line">
          {line}
        </p>
      )}
      {ready === null ? (
        <p className="text-xs text-rose-200" data-bot="stay-message-unreadable">
          The messages could not be read just now. This is not an empty list, and nothing was sent.
        </p>
      ) : ready.length === 0 ? (
        <p className="text-xs text-slate-500" data-bot="stay-message-none">
          No message is right for today. Nothing is sent on its own.
        </p>
      ) : (
        <>
          <label className="block text-xs text-slate-500">
            Send to
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              data-bot="stay-message-to"
              placeholder="guest@example.com"
              className="ml-2 w-56 rounded-full border border-slate-700 bg-transparent px-3 py-1 text-slate-200"
            />
          </label>
          <ul className="flex flex-wrap gap-2">
            {ready.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  disabled={busy === message.id}
                  onClick={() => void send(message.id)}
                  data-bot="stay-message-send"
                  data-message={message.id}
                  className="rounded-full border border-slate-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-200 disabled:opacity-50"
                >
                  {busy === message.id ? 'Sending…' : `Send: ${message.subject}`}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {sent.length > 0 && (
        <p className="text-xs text-slate-500" data-bot="stay-message-already">
          Already sent: {sent.map((row) => row.id).join(', ')}. A message is never sent twice.
        </p>
      )}
      {notice && (
        <p className="text-xs text-emerald-200" data-bot="stay-message-sent">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-200" data-bot="stay-message-error">
          {error}
        </p>
      )}
    </div>
  );
}
