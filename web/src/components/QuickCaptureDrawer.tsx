import { useEffect, useState } from 'react';
import { api, type ExpensePropertyId } from '../lib/api';
import { currentYearMonth, currentDayIso } from '../lib/months';
import { useReadOnly } from '../lib/platform/viewer';

type Mode = 'receipt' | 'voice' | 'task';

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function QuickCaptureDrawer() {
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('receipt');
  const [propertyId, setPropertyId] = useState<ExpensePropertyId>('ranch');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [paidBy, setPaidBy] = useState<'brandon' | 'todd'>('brandon');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('uml:quick-capture', show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('uml:quick-capture', show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (mode === 'task' && propertyId !== 'ranch' && propertyId !== 'lindon' && propertyId !== 'river') {
      setPropertyId('ranch');
    }
  }, [mode, propertyId]);

  if (!open) return null;
  const construction = propertyId === 'construction';

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={() => setOpen(false)}>
      <form
        data-bot="quick-capture-drawer"
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--uml-bg)] p-5 shadow-[var(--uml-shadow)]"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-3xl">Log</p>
          <button type="button" className="uml-nav" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        {readOnly ? <p className="mt-3 text-sm">This login can read the books. It cannot log a bill or a task.</p> : null}
        <div className="mt-4 flex gap-2">
          {(['receipt', 'voice', 'task'] as const).map((item) => (
            <button key={item} type="button" className="uml-nav" aria-pressed={mode === item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          Where
          <select
            className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3"
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value as ExpensePropertyId)}
          >
            <option value="ranch">Ranch</option>
            <option value="lindon">Lindon</option>
            <option value="river">River</option>
            {mode === 'task' ? null : (
              <>
                <option value="household">Household</option>
                <option value="construction">Construction</option>
              </>
            )}
          </select>
        </label>
        {construction ? (
          <div className="mt-3 grid gap-3">
            <label className="text-sm">
              Paid by
              <select className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={paidBy} onChange={(event) => setPaidBy(event.target.value as 'brandon' | 'todd')}>
                <option value="brandon">Brandon & Stephanie</option>
                <option value="todd">Todd</option>
              </select>
            </label>
            <label className="text-sm">
              Stage
              <input className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={stage} onChange={(event) => setStage(event.target.value)} />
            </label>
          </div>
        ) : null}
        {mode === 'receipt' ? (
          <label className="mt-4 block text-sm">
            Receipt
            <input
              type="file"
              accept="image/*,application/pdf"
              className="mt-1 block w-full text-sm"
              disabled={readOnly}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void scan(file);
              }}
            />
          </label>
        ) : null}
        {mode === 'voice' ? (
          <VoiceNote
            disabled={readOnly}
            onText={(text) => {
              setNote(text);
              setStatus('Transcript is in the note. It is not saved until you log it.');
            }}
          />
        ) : null}
        <label className="mt-4 block text-sm">
          Note
          <textarea className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {mode !== 'task' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm">
              Amount
              <input className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="text-sm">
              Category
              <input className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-[var(--uml-surface-input)] p-3" value={category} onChange={(event) => setCategory(event.target.value)} />
            </label>
          </div>
        ) : null}
        <button type="submit" className="uml-gold-btn mt-4 w-full rounded-full py-3 text-sm uppercase tracking-widest" disabled={readOnly || busy}>
          {mode === 'task' ? 'Save task' : 'Save expense'}
        </button>
        {status ? <p className="mt-3 text-sm">{status}</p> : null}
      </form>
    </div>
  );

  async function scan(file: File) {
    setBusy(true);
    setStatus('Reading the bill. Nothing is saved yet.');
    try {
      const imageBase64 = await fileToBase64(file);
      const draft = await api.scanExpense({
        type: 'image',
        imageBase64,
        mimeType: file.type || 'image/jpeg',
        propertyId: propertyId === 'construction' ? undefined : propertyId === 'household' ? 'household' : propertyId,
      });
      if (draft.amount) setAmount(String(draft.amount));
      if (draft.category) setCategory(draft.category);
      if (draft.note || draft.vendor) setNote([draft.vendor, draft.note].filter(Boolean).join(' — '));
      setStatus('Check the fields. Saving is a separate step.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The bill could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (readOnly) return;
    setBusy(true);
    try {
      if (mode === 'task') {
        if (propertyId !== 'ranch' && propertyId !== 'lindon' && propertyId !== 'river') {
          setStatus('A task belongs on Ranch, Lindon, or River.');
          return;
        }
        await api.createOpsTask({ propertyId, dueDate: currentDayIso(), type: 'other', notes: note });
        setStatus('Task saved. No text was sent.');
        setNote('');
        return;
      }
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0 || !category.trim()) {
        setStatus('Amount and category are required before a bill is saved.');
        return;
      }
      await api.addExpense({
        propertyId,
        month: currentYearMonth(),
        category: category.trim(),
        amount: value,
        note: note.trim() || undefined,
        ...(construction ? { paidBy, stage: stage.trim() || undefined } : {}),
      });
      setStatus('Saved.');
      setAmount('');
      setCategory('');
      setNote('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  }
}

function VoiceNote({ disabled, onText }: { disabled: boolean; onText: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="mt-4">
      <button
        type="button"
        className="uml-nav"
        disabled={disabled || recording}
        onClick={() => {
          const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!Speech || !navigator.mediaDevices?.getUserMedia) {
            void record(onText, setRecording, setError);
            return;
          }
          const recog = new Speech();
          recog.lang = 'en-US';
          recog.onresult = (event: SpeechRecognitionEvent) => {
            const text = event.results[0]?.[0]?.transcript ?? '';
            if (text) onText(text);
          };
          recog.onerror = () => setError('The microphone could not transcribe that.');
          recog.start();
        }}
      >
        {recording ? 'Listening…' : 'Dictate'}
      </button>
      {error ? <p className="mt-2 text-sm">{error}</p> : null}
    </div>
  );
}

async function record(onText: (text: string) => void, setRecording: (value: boolean) => void, setError: (value: string) => void) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      void blob.arrayBuffer().then(async (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        const result = await api.agentTranscribe({ audioBase64: btoa(binary), mimeType: blob.type || 'audio/webm' });
        onText(result.text);
      });
    };
    setRecording(true);
    recorder.start();
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
      setRecording(false);
    }, 8000);
  } catch {
    setError('Microphone permission was not granted.');
  }
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  }
}

type SpeechConstructor = new () => {
  lang: string;
  start: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
};
