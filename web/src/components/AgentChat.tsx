import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Mic, Send, X } from 'lucide-react';
import { useAgentChat } from '../hooks/useAgentChat';
import { useSpeechCapture } from '../hooks/useSpeechCapture';
import { AgentToolSteps } from './AgentToolSteps';

export function AgentChat({
  month,
  activeTab,
  onError,
}: {
  month: string;
  activeTab: string;
  onError: (msg: string) => void;
}) {
  const { open, setOpen, messages, loading, toolSteps, sendMessage } = useAgentChat({
    month,
    activeTab,
    onError,
  });
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { state: speechState, toggle: toggleMic } = useSpeechCapture(
    (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    onError,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, open]);

  const submit = () => {
    if (!input.trim()) return;
    void sendMessage(input);
    setInput('');
  };

  if (!open) {
    return (
      <button
        type="button"
        data-bot="open-cohost"
        aria-label="Open co-host chat"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-40 pointer-events-auto flex items-center gap-2 px-5 py-3 min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white shadow-2xl text-xs font-black uppercase tracking-wider"
      >
        <Bot className="w-5 h-5" />
        Co-host
      </button>
    );
  }

  return (
    <div
      data-bot="cohost-panel"
      className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-6 z-50 pointer-events-auto flex flex-col sm:w-[420px] sm:max-h-[min(640px,calc(100dvh-2rem))] bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-400" />
          <div>
            <p className="text-sm font-black text-white">AI Co-host</p>
            <p className="text-[10px] text-slate-500">Reservations · finances · pricing</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close co-host"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50dvh] sm:max-h-[360px]">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500 leading-relaxed">
            Ask anything: &quot;Who checks in at Ranch this week?&quot; · &quot;Log $150 plumbing at
            Lindon&quot; · &quot;Compare our rates to comps&quot;
          </p>
        )}
        {messages
          .filter((m) => m.role !== 'tool')
          .map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-2xl px-3 py-2 max-w-[90%] ${
                m.role === 'user'
                  ? 'ml-auto bg-violet-600 text-white'
                  : 'mr-auto bg-slate-800 text-slate-200'
              }`}
            >
              {m.content}
            </div>
          ))}
        <div ref={bottomRef} />
      </div>

      <AgentToolSteps steps={toolSteps} loading={loading} />

      <div className="p-3 border-t border-slate-800 flex gap-2 items-end bg-slate-950/50">
        <button
          type="button"
          onClick={toggleMic}
          disabled={loading || speechState === 'processing'}
          className={`shrink-0 p-3 min-h-[44px] min-w-[44px] rounded-xl transition-all ${
            speechState === 'listening'
              ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-500/30'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
          aria-label="Voice input"
        >
          {speechState === 'processing' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message your co-host…"
          rows={2}
          disabled={loading}
          className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 min-h-[44px]"
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={submit}
          className="shrink-0 p-3 min-h-[44px] min-w-[44px] rounded-xl bg-violet-600 disabled:opacity-40 text-white hover:bg-violet-500"
          aria-label="Send"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
