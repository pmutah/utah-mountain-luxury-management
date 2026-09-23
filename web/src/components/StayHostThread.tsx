import { useEffect, useState } from 'react';
import { api, type StayThreadMessage } from '../lib/api';

export function StayHostThread({ token }: { token: string }) {
  const [title, setTitle] = useState('Guest thread');
  const [messages, setMessages] = useState<StayThreadMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void api
      .getStayGuide(token, true)
      .then((stay) => {
        if (stay.guestName) setTitle(`${stay.guestName} · ${stay.propertyName.replace(/^The /, '')}`);
      })
      .catch(() => setTitle('Guest thread'));
  }, [token]);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      void api
        .getStayThread(token, true)
        .then((data) => {
          if (!stop) setMessages(data.messages);
        })
        .catch((err: unknown) => {
          if (!stop) setError(err instanceof Error ? err.message : 'Could not load this thread.');
        });
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [token]);

  async function send() {
    const reply = text.trim();
    if (!reply) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.replyStayThread(token, reply);
      setMessages((prev) => [...prev, result.message]);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  function dictate() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError('This browser has no dictation. Type the reply.');
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript ?? '';
      if (heard) setText((prev) => (prev ? `${prev} ${heard}` : heard));
    };
    rec.start();
  }

  return (
    <div className="min-h-screen bg-[#07110f] text-[#f6f1e8]" data-bot="stay-host-thread">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]">Nora</p>
        <h1 className="mt-2 font-display text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-white/50">Your reply shows on their stay.</p>
        <div className="mt-6 flex-1 space-y-3">
          {messages.length === 0 && <p className="text-sm text-white/40">Nothing from the guest yet.</p>}
          {messages.map((message) => (
            <p
              key={message.id}
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.from === 'host' ? 'bg-[#d4b56a]/15 text-[#f6f1e8]' : 'bg-white/5 text-[#d7cfc3]'
              }`}
            >
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-[#d4b56a]">
                {message.from === 'host' ? 'You' : 'Guest needs'}
              </span>
              {message.text}
            </p>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <div className="mt-4 space-y-2 pb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="I’ll bring wood around 8."
            data-bot="stay-host-reply"
            className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm outline-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={dictate} className="rounded-full border border-white/15 px-4 py-3 text-sm">
              Speak
            </button>
            <button
              type="button"
              data-bot="stay-host-send"
              disabled={sending || !text.trim()}
              onClick={() => void send()}
              className="flex-1 rounded-full bg-[#d4b56a] px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send to guest'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type SpeechRec = {
  lang: string;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  start: () => void;
};
