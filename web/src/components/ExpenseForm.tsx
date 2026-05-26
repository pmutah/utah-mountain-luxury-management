import { useRef, useState } from 'react';
import { Camera, Loader2, Plus } from 'lucide-react';
import { api, formatCurrency } from '../lib/api';

const CATEGORIES = ['Maintenance', 'Supplies', 'Utilities', 'Insurance', 'Other'] as const;

export function ExpenseForm({
  propertyId,
  month,
  onSaved,
  onError,
}: {
  propertyId: string;
  month: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCategory(CATEGORIES[0]);
    setAmount('');
    setPreview(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) {
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const submit = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      onError('Enter a valid amount');
      return;
    }
    if (!file) {
      onError('Add a receipt photo before saving');
      return;
    }
    setSaving(true);
    try {
      await api.createExpense({
        propertyId,
        month,
        category,
        amount: parsed,
        file,
      });
      reset();
      setOpen(false);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-slate-700 text-slate-400 text-xs font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-400 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add expense with receipt
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">New expense</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Amount</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-white"
          />
        </label>
      </div>

      <label className="flex flex-col items-center gap-2 cursor-pointer">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onFileChange}
        />
        {preview ? (
          <img
            src={preview}
            alt="Receipt preview"
            className="w-full max-h-40 object-contain rounded-xl border border-slate-800"
          />
        ) : (
          <span className="flex items-center gap-2 py-8 w-full justify-center rounded-xl border border-dashed border-slate-700 text-slate-500 text-xs font-black uppercase">
            <Camera className="w-5 h-5" />
            Tap to capture or upload receipt
          </span>
        )}
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-xs font-black uppercase"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save {amount ? formatCurrency(Number(amount) || 0) : ''}
        </button>
      </div>
    </div>
  );
}
