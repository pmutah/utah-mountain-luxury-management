import { useEffect, useRef, useState } from 'react';
import { HardHat, Loader2, Paperclip, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import { useConstructionChat } from '../hooks/useConstructionChat';
import { AgentToolSteps } from './AgentToolSteps';

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  return { base64: btoa(binary), mimeType };
}

export function ConstructionManagerChat({
  onError,
  onToast,
}: {
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const {
    open,
    setOpen,
    messages,
    loading,
    toolSteps,
    briefing,
    sendMessage,
    disclaimerAccepted,
    acceptDisclaimer,
  } = useConstructionChat({ onError });
  const [input, setInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, open]);

  const submit = () => {
    if (!input.trim()) return;
    void sendMessage(input);
    setInput('');
  };

  const onAttach = async (file: File) => {
    if (!disclaimerAccepted) return;
    setUploadingFile(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      await api.uploadConstructionDocument({
        fileBase64: base64,
        mimeType,
        fileName: file.name,
      });
      onToast('Saved to project documents', 'success');
      void sendMessage(
        `I uploaded ${file.name}. Review it and tell me what matters for this project.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingFile(false);
      if (attachRef.current) attachRef.current.value = '';
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 flex items-center gap-2 px-5 py-3 min-h-[52px] rounded-2xl bg-amber-600 hover:bg-amber-500 text-white shadow-2xl text-xs font-black uppercase tracking-wider"
      >
        <HardHat className="w-5 h-5" />
        Build
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-24 z-50 flex flex-col sm:w-[420px] sm:max-h-[min(640px,calc(100dvh-6rem))] bg-slate-900 border border-amber-700/50 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/90">
        <div className="flex items-center gap-2">
          <HardHat className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-sm font-black text-white">Construction Manager</p>
            <p className="text-[10px] text-slate-500">A/E/C genius · all trades · your project</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!disclaimerAccepted && (
        <div className="p-4 bg-amber-950/40 border-b border-amber-800/30 text-xs text-amber-100/90 space-y-2">
          <p className="font-bold uppercase tracking-wide text-[10px] text-amber-400">Disclaimer</p>
          <p>
            Genius-level decision support only — not a licensed architect, engineer, or contractor.
            Verify structure, permits, and life-safety items with licensees and your AHJ.
          </p>
          <button
            type="button"
            onClick={acceptDisclaimer}
            className="w-full py-2 rounded-xl bg-amber-600 text-white font-bold text-xs uppercase"
          >
            I understand
          </button>
        </div>
      )}

      {briefing && disclaimerAccepted && (
        <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-[11px] text-amber-200/80">
          <span className="font-bold text-amber-500">Briefing: </span>
          {briefing}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50dvh] sm:max-h-[320px]">
        {messages.length === 0 && disclaimerAccepted && (
          <p className="text-xs text-slate-500 leading-relaxed">
            Ask: &quot;What should we do this week for framing?&quot; · &quot;Compare electrician
            bids&quot; · &quot;Right way to flash this door?&quot; · &quot;Review our stage before
            drywall&quot;
          </p>
        )}
        {messages
          .filter((m) => m.role !== 'tool')
          .map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-2xl px-3 py-2 max-w-[90%] ${
                m.role === 'user'
                  ? 'ml-auto bg-amber-600 text-white'
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
        <input
          ref={attachRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onAttach(file);
          }}
        />
        <button
          type="button"
          disabled={loading || uploadingFile || !disclaimerAccepted}
          onClick={() => attachRef.current?.click()}
          className="shrink-0 p-3 min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40"
          aria-label="Upload document to project"
        >
          {uploadingFile ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Paperclip className="w-5 h-5" />
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
          placeholder="Ask your Construction Manager…"
          rows={2}
          disabled={loading || !disclaimerAccepted}
          className="flex-1 resize-none bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 min-h-[44px]"
        />
        <button
          type="button"
          disabled={loading || !input.trim() || !disclaimerAccepted}
          onClick={submit}
          className="shrink-0 p-3 min-h-[44px] min-w-[44px] rounded-xl bg-amber-600 disabled:opacity-40 text-white hover:bg-amber-500"
          aria-label="Send"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
