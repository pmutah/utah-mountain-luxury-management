import { useEffect, useRef, useState } from 'react';
import { api, type ConciergeChatMessage } from '../lib/api';

export function GuestConcierge({ token, preview }: { token: string; preview: boolean }) {
  const [messages, setMessages] = useState<ConciergeChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    void api.getConciergeChat(token, preview).then((result) => {
      if (!stop) setMessages(result.messages);
    }).catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [token, preview]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setError(null);
    setSending(true);
    const optimistic: ConciergeChatMessage = {
      id: 'pending',
      from: 'guest',
      text,
      at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const result = await api.askConcierge(token, text, preview);
      setMessages(result.messages);
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== 'pending'));
      setDraft(text);
      setError(err instanceof Error ? err.message : 'Nora could not answer.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-[#d4b56a]/40 bg-[#d4b56a]/10 p-5" data-bot="stay-concierge">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]">Your concierge</p>
      <p className="mt-2 text-2xl text-[#f6f1e8]">Nora</p>
      <p className="mt-1 text-sm text-[#d7cfc3]">Ask about the house, dinner, the canyon, or anything you need during your stay.</p>
      <div ref={scroller} className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div key={message.id} className={message.from === 'guest' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                message.from === 'guest' ? 'bg-[#d4b56a] text-black' : 'bg-black/30 text-[#f6f1e8]'
              }`}
            >
              <ConciergeText text={message.text} guest={message.from === 'guest'} />
            </div>
          </div>
        ))}
        {sending && <p className="text-sm text-white/50">Nora is writing…</p>}
      </div>
      {error && <p className="mt-3 text-sm text-[#f0c7a0]">{error}</p>}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask Nora"
          data-bot="stay-concierge-input"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          data-bot="stay-concierge-send"
          className="rounded-full bg-[#d4b56a] px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="mt-3 text-xs text-white/45">If she can’t help, she texts Brandon. His reply shows at the top of your stay.</p>
    </div>
  );
}

const MAPS_LINE = /^https:\/\/(?:maps\.google\.com|www\.google\.com\/maps)\S*$/i;
const OPEN_LINE = /^Open (.+) in Google Maps$/;

function ConciergeText({ text, guest }: { text: string; guest: boolean }) {
  const lines = text.split('\n');
  const blocks: Array<{ type: 'text'; value: string } | { type: 'maps'; label: string; href: string }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (MAPS_LINE.test(line)) {
      const previous = blocks[blocks.length - 1];
      let label = 'Open in Google Maps';
      if (previous?.type === 'text') {
        const parts = previous.value.split('\n');
        const named = (parts[parts.length - 1] ?? '').trim().match(OPEN_LINE);
        if (named) {
          label = `Open ${named[1]} in Google Maps`;
          parts.pop();
          previous.value = parts.join('\n').replace(/\n+$/, '');
          if (!previous.value.trim()) blocks.pop();
        }
      }
      blocks.push({ type: 'maps', label, href: line });
      continue;
    }
    const previous = blocks[blocks.length - 1];
    if (previous?.type === 'text') previous.value = `${previous.value}\n${lines[i]}`;
    else blocks.push({ type: 'text', value: lines[i] });
  }

  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'text' ? (
          <span key={index}>{block.value}</span>
        ) : (
          <a
            key={index}
            href={block.href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              guest
                ? 'mt-2 inline-block font-semibold underline'
                : 'mt-2 inline-block rounded-full bg-[#d4b56a] px-3 py-1.5 text-xs font-semibold text-black no-underline'
            }
          >
            {block.label}
          </a>
        ),
      )}
    </>
  );
}
