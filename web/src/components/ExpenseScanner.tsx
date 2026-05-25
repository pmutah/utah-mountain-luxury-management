import { useCallback, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, ScanLine, Trash2, Type } from 'lucide-react';
import { api, formatCurrency, PROPERTIES, type Expense, type ExpenseScanResult } from '../lib/api';

const CATEGORIES = [
  'Maintenance',
  'Supplies',
  'Utilities',
  'Cleaning',
  'Insurance',
  'HOA',
  'Landscaping',
  'Other',
];

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return { base64: btoa(binary), mimeType: file.type || 'image/jpeg' };
}

export function ExpenseScanner({
  propertyId,
  month,
  expenses,
  onSaved,
  onError,
  onToast,
}: {
  propertyId: 'ranch' | 'lindon';
  month: string;
  expenses: Expense[];
  onSaved: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<(ExpenseScanResult & { propertyId: 'ranch' | 'lindon' }) | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const customExpenses = expenses.filter(
    (e) => e.propertyId === propertyId && e.month === month && e.category !== 'Mortgage' && e.id.startsWith('exp-'),
  );

  const runScan = useCallback(
    async (payload: Parameters<typeof api.scanExpense>[0]) => {
      setScanning(true);
      setPreview(null);
      try {
        const result = await api.scanExpense(payload);
        const prop = (result.propertyId ?? propertyId) as 'ranch' | 'lindon';
        setPreview({
          ...result,
          propertyId: prop,
          month: result.month || month,
        });
        onToast('Receipt scanned — review and save', 'info');
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Scan failed');
      } finally {
        setScanning(false);
      }
    },
    [propertyId, month, onError, onToast],
  );

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      onError('Please drop or select an image (PNG, JPG, etc.)');
      return;
    }
    const { base64, mimeType } = await fileToBase64(file);
    await runScan({ type: 'image', imageBase64: base64, mimeType, propertyId, month });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void handleFiles({ 0: file, length: 1, item: () => file } as unknown as FileList);
        return;
      }
    }
  };

  const saveExpense = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await api.addExpense({
        propertyId: preview.propertyId,
        month: preview.month,
        category: preview.category,
        amount: preview.amount,
        note: preview.note,
        vendor: preview.vendor,
      });
      setPreview(null);
      setText('');
      setOpen(false);
      onSaved();
      onToast('Expense added to portfolio', 'success');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await api.deleteExpense(id);
      onSaved();
      onToast('Expense removed', 'success');
    } catch {
      onError('Could not delete expense');
    }
  };

  return (
    <div className="p-6 bg-slate-950/50 rounded-[24px] border border-slate-800/50 flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ScanLine className="w-4 h-4 text-emerald-500" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Scan receipt / add expense
          </p>
        </div>
        <span className="text-xs text-slate-500 font-bold">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="space-y-4" onPaste={onPaste}>
          <p className="text-[9px] text-slate-600 font-bold">
            Drop a screenshot, paste an image, take a photo, or paste receipt text for {PROPERTIES[propertyId].name}.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
              dragOver ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/50'
            }`}
          >
            {scanning ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-xs font-bold uppercase tracking-widest">Reading receipt…</p>
              </div>
            ) : (
              <>
                <ImagePlus className="w-8 h-8 mx-auto text-slate-500 mb-3" />
                <p className="text-sm font-bold text-slate-300 mb-4">Drop screenshot here or paste (Ctrl+V)</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-black uppercase flex items-center gap-2 min-h-[44px]"
                  >
                    <ImagePlus className="w-4 h-4" /> Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="px-4 py-2 bg-slate-800 rounded-xl text-xs font-black uppercase flex items-center gap-2 min-h-[44px]"
                  >
                    <Camera className="w-4 h-4" /> Camera
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
              <Type className="w-3 h-3" /> Or paste receipt text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Ace Hardware $47.82 — hose repair Ranch House"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder:text-slate-600 resize-none"
            />
            <button
              type="button"
              disabled={!text.trim() || scanning}
              onClick={() => void runScan({ type: 'text', text: text.trim(), propertyId, month })}
              className="self-end px-4 py-2 bg-emerald-600 disabled:opacity-40 rounded-xl text-xs font-black uppercase min-h-[44px]"
            >
              Scan text
            </button>
          </div>

          {preview && (
            <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-800/50 space-y-3">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Review expense</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[9px] text-slate-500 uppercase font-bold">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={preview.amount}
                    onChange={(e) => setPreview({ ...preview, amount: Number(e.target.value) })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-black text-white"
                  />
                </label>
                <label className="text-[9px] text-slate-500 uppercase font-bold">
                  Month
                  <input
                    type="month"
                    value={preview.month}
                    onChange={(e) => setPreview({ ...preview, month: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-black text-white"
                  />
                </label>
                <label className="text-[9px] text-slate-500 uppercase font-bold col-span-2">
                  Category
                  <select
                    value={preview.category}
                    onChange={(e) => setPreview({ ...preview, category: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-black text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[9px] text-slate-500 uppercase font-bold col-span-2">
                  Property
                  <select
                    value={preview.propertyId}
                    onChange={(e) =>
                      setPreview({ ...preview, propertyId: e.target.value as 'ranch' | 'lindon' })
                    }
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-black text-white"
                  >
                    <option value="ranch">The Ranch House</option>
                    <option value="lindon">The Lindon House</option>
                  </select>
                </label>
                {preview.vendor && (
                  <p className="col-span-2 text-xs text-slate-400">
                    Vendor: <span className="text-white font-bold">{preview.vendor}</span>
                  </p>
                )}
                {preview.note && (
                  <p className="col-span-2 text-xs text-slate-500 italic">{preview.note}</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="px-4 py-2 text-xs font-black uppercase text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveExpense()}
                  className="px-6 py-2 bg-emerald-600 rounded-xl text-xs font-black uppercase min-h-[44px]"
                >
                  {saving ? 'Saving…' : `Add ${formatCurrency(preview.amount)}`}
                </button>
              </div>
            </div>
          )}

          {customExpenses.length > 0 && (
            <div className="pt-2 border-t border-slate-800/50">
              <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">Scanned expenses this month</p>
              {customExpenses.map((e) => (
                <div key={e.id} className="flex justify-between items-center text-sm mb-2 group">
                  <span className="text-slate-400 truncate flex-1 mr-2">
                    {e.vendor ? `${e.vendor} · ` : ''}
                    {e.category}
                    {e.note ? ` — ${e.note}` : ''}
                  </span>
                  <span className="font-black text-white shrink-0">{formatCurrency(e.amount)}</span>
                  <button
                    type="button"
                    onClick={() => void deleteExpense(e.id)}
                    className="ml-2 p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
