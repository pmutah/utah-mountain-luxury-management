import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Plus, Sofa, Type } from 'lucide-react';
import {
  api,
  formatCurrency,
  HOUSEHOLD_PROPERTY_ID,
  type Expense,
  type ExpenseScanResult,
} from '../lib/api';
import {
  isHouseholdCategory,
  looksLikeReceiptText,
  parseHouseholdText,
} from '../lib/household-text';
import { currentYearMonth, formatMonthLabel } from '../lib/months';
import { fileFromClipboard, isChatPasteTarget, prepareReceiptFile } from '../lib/receipt-image';
import { ExpenseRow } from './ExpenseRow';

const CATEGORIES = ['Furnishings', 'Decor', 'Supplies', 'Other'] as const;

function mentionsRentalAddress(value: string): boolean {
  return /270|harcliff|ranch house|lindon house|river house/i.test(value);
}

export function OurExpenses({
  onToast,
  onError,
}: {
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Furnishings');
  const [receiptText, setReceiptText] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<{
    base64: string;
    mimeType: string;
    name: string;
    previewUrl: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getExpenses();
      setExpenses(
        data.custom
          .filter((e) => e.propertyId === HOUSEHOLD_PROPERTY_ID)
          .sort((a, b) => (b.createdAt ?? b.month).localeCompare(a.createdAt ?? a.month)),
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch the household ledger when this tab mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses],
  );

  const applyLocalParse = (text: string) => {
    const parsed = parseHouseholdText(text);
    if (parsed.amount != null) setAmount(String(parsed.amount));
    if (parsed.description) setDescription(parsed.description);
    if (parsed.category) setCategory(parsed.category);
    return parsed;
  };

  const fieldsFromScan = (result: ExpenseScanResult) => {
    const vendor = result.vendor?.trim() || '';
    const note = result.note?.trim() || '';
    const rentalLike = mentionsRentalAddress(`${vendor} ${note}`);
    const parts = [vendor, note].filter(Boolean);
    const unique = parts.filter(
      (part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index,
    );
    const description = rentalLike
      ? mentionsRentalAddress(vendor)
        ? ''
        : vendor
      : unique.join(' — ');
    return {
      amount: Number.isFinite(result.amount) && result.amount > 0 ? result.amount : null,
      description,
      category: isHouseholdCategory(result.category) ? result.category : undefined,
    };
  };

  const applyScan = (result: ExpenseScanResult) => {
    const fields = fieldsFromScan(result);
    if (fields.amount != null) setAmount(String(fields.amount));
    if (fields.description) setDescription(fields.description);
    if (fields.category) setCategory(fields.category);
    return fields;
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setCategory('Furnishings');
    setReceiptText('');
    setReceipt(null);
  };

  const saveExpense = async (input: {
    what: string;
    value: number;
    category: (typeof CATEGORIES)[number];
    receipt?: { base64: string; mimeType: string } | null;
  }) => {
    const saved = await api.addExpense({
      propertyId: HOUSEHOLD_PROPERTY_ID,
      month: currentYearMonth(),
      category: input.category,
      amount: input.value,
      note: input.what,
      paidBy: 'brandon',
      receiptBase64: input.receipt?.base64,
      receiptMimeType: input.receipt?.mimeType,
    });
    if (saved.receiptWarning) onToast(saved.receiptWarning, 'info');
    resetForm();
    onToast(`Saved ${formatCurrency(input.value)}`, 'success');
    await load();
  };

  const commitIfReady = async (input: {
    what: string;
    value: number | null;
    category?: (typeof CATEGORIES)[number];
    receipt?: { base64: string; mimeType: string } | null;
    readyToast: string;
  }) => {
    const what = input.what.trim();
    const value = input.value;
    const nextCategory = input.category ?? category;
    if (what && value != null && value > 0) {
      await saveExpense({
        what,
        value,
        category: nextCategory,
        receipt: input.receipt,
      });
      return true;
    }
    onToast(input.readyToast, 'info');
    return false;
  };

  const readPastedText = async (raw: string) => {
    const text = raw.replace(/\u00a0/g, ' ').trim();
    if (!text) return;
    setReceiptText(text);
    const local = applyLocalParse(text);
    setScanning(true);
    try {
      const result = await api.scanExpense({
        type: 'text',
        text,
        propertyId: HOUSEHOLD_PROPERTY_ID,
        month: currentYearMonth(),
      });
      const fields = applyScan(result);
      await commitIfReady({
        what: fields.description || local.description,
        value: fields.amount ?? local.amount,
        category: fields.category ?? local.category ?? undefined,
        readyToast: 'Text read — check the amount and save',
      });
    } catch (e) {
      const saved = await commitIfReady({
        what: local.description,
        value: local.amount,
        category: local.category ?? undefined,
        readyToast:
          local.amount != null || local.description
            ? 'Text pasted — check the amount and save'
            : e instanceof Error
              ? e.message
              : 'Could not read that text — type what it was and the amount',
      });
      if (!saved && !local.description && local.amount == null) {
        onError(e instanceof Error ? e.message : 'Could not read that text');
      }
    } finally {
      setScanning(false);
    }
  };

  const attachFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const prepared = await prepareReceiptFile(file);
      setReceipt(prepared);
      setScanning(true);
      try {
        const result = await api.scanExpense({
          type: 'image',
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
          propertyId: HOUSEHOLD_PROPERTY_ID,
          month: currentYearMonth(),
        });
        const fields = applyScan(result);
        await commitIfReady({
          what: fields.description,
          value: fields.amount,
          category: fields.category,
          receipt: prepared,
          readyToast: 'Receipt read — check the amount and save',
        });
      } catch (e) {
        onToast(
          e instanceof Error
            ? `${e.message} Screenshot is attached — type the amount and save.`
            : 'Screenshot attached — type the amount and save',
          'info',
        );
      } finally {
        setScanning(false);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not read that photo');
    }
  };

  const handleClipboard = (data: DataTransfer | null, target: EventTarget | null) => {
    if (isChatPasteTarget(target)) return false;
    const file = fileFromClipboard(data);
    if (file) {
      void attachFile(file);
      return true;
    }
    const pasted = data?.getData('text/plain') ?? '';
    if (!pasted.trim()) return false;

    const el = target instanceof Element ? target : null;
    const field = el?.closest('input, textarea, select') as HTMLElement | null;
    const pasteBox = field?.getAttribute('data-bot') === 'ours-expense-text';
    const whatField = field?.getAttribute('data-bot') === 'ours-expense-what';
    if (pasteBox || !field || (whatField && looksLikeReceiptText(pasted))) {
      void readPastedText(pasted);
      return true;
    }
    return false;
  };

  const handleClipboardRef = useRef(handleClipboard);

  useEffect(() => {
    handleClipboardRef.current = handleClipboard;
  });

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (handleClipboardRef.current(e.clipboardData, e.target)) {
        e.preventDefault();
      }
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, []);

  const save = async () => {
    const what = description.trim();
    const value = Number(amount);
    if (!what) {
      onError('Type what the expense was');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      onError('Enter a dollar amount');
      return;
    }
    setSaving(true);
    try {
      await saveExpense({ what, value, category, receipt });
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  const deleteExpense = async (id: string) => {
    await api.deleteExpense(id);
    await load();
  };

  return (
    <div className="space-y-8" data-bot="our-expenses">
      <div>
        <h2 className="text-3xl font-black text-white">Our expenses</h2>
        <p className="text-xs text-slate-400 mt-2">
          Brandon &amp; Stephanie — furnishings and things we buy for the house. Take a photo, paste a
          screenshot or receipt text, or type it in. These stay off the rental profit report.
        </p>
      </div>

      <div className="bg-rose-950/40 p-6 sm:p-8 rounded-[40px] border border-rose-800/50">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">We have put in</p>
        <p className="text-4xl font-black text-rose-300 mt-2">{formatCurrency(total)}</p>
        <p className="text-[10px] text-slate-500 font-bold mt-2">
          {expenses.length} {expenses.length === 1 ? 'purchase' : 'purchases'}
        </p>
      </div>

      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-rose-800/40 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-rose-400" />
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Add an expense</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) {
              void attachFile(file);
              return;
            }
            const dropped = e.dataTransfer.getData('text/plain');
            if (dropped.trim()) void readPastedText(dropped);
          }}
          className={`border-2 border-dashed rounded-2xl p-6 text-center mb-6 transition-colors ${
            dragOver ? 'border-rose-400 bg-rose-500/10' : 'border-slate-700 bg-slate-950/50'
          }`}
        >
          {scanning ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
              <p className="text-xs font-bold uppercase tracking-widest">Reading receipt…</p>
            </div>
          ) : (
            <>
              <ImagePlus className="w-8 h-8 mx-auto text-slate-500 mb-3" />
              <p className="text-sm font-bold text-slate-300 mb-4">
                Drop a photo, paste a screenshot or text (Ctrl+V), or take a picture
              </p>
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
                  className="px-4 py-2 bg-rose-700 rounded-xl text-xs font-black uppercase flex items-center gap-2 min-h-[44px] text-white"
                >
                  <Camera className="w-4 h-4" /> Camera
                </button>
              </div>
              {receipt && (
                <p className="text-[10px] font-bold text-rose-300 uppercase tracking-wider mt-4">
                  Attached: {receipt.name}
                </p>
              )}
            </>
          )}
          {receipt?.previewUrl && (
            <img
              src={receipt.previewUrl}
              alt="Receipt preview"
              className="mt-4 mx-auto max-h-40 object-contain rounded-xl border border-slate-700 bg-slate-950"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              void attachFile(e.target.files?.[0]);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void attachFile(e.target.files?.[0]);
              if (cameraRef.current) cameraRef.current.value = '';
            }}
          />
        </div>

        <div className="flex flex-col gap-2 mb-6">
          <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
            <Type className="w-3 h-3" /> Or paste receipt text
          </label>
          <textarea
            data-bot="ours-expense-text"
            value={receiptText}
            onChange={(e) => setReceiptText(e.target.value)}
            placeholder="e.g. Wayfair dresser $899 — or paste an order confirmation"
            rows={3}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder:text-slate-600 resize-none"
          />
          <button
            type="button"
            data-bot="ours-expense-read-text"
            disabled={!receiptText.trim() || scanning}
            onClick={() => void readPastedText(receiptText)}
            className="self-end px-4 py-2 bg-rose-700 disabled:opacity-40 rounded-xl text-xs font-black uppercase min-h-[44px] text-white"
          >
            Read text
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="text-[10px] font-bold text-slate-500 uppercase">
            What it was
            <textarea
              data-bot="ours-expense-what"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Master bedroom dresser, Costco towels, lamps"
              rows={2}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white placeholder:text-slate-600 resize-none"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Amount
              <div className="mt-1 flex items-center bg-slate-950 rounded-xl px-3 py-2 border border-slate-700">
                <span className="text-slate-500 mr-2 font-bold">$</span>
                <input
                  data-bot="ours-expense-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent border-none text-sm font-black text-white w-full p-0 focus:ring-0 outline-none"
                />
              </div>
            </label>
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Type
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white"
              >
                {CATEGORIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            data-bot="ours-expense-save"
            disabled={saving || scanning}
            className="self-end px-6 py-3 rounded-xl text-xs font-black uppercase min-h-[44px] bg-rose-600 text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </section>

      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-6">
          <Sofa className="w-4 h-4" />
          What we have logged
        </h3>
        {loading ? (
          <p className="text-xs text-slate-600 font-bold">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-xs text-slate-600 font-bold">
            Nothing logged yet. Paste text, add a photo, or type the first purchase above.
          </p>
        ) : (
          <ul>
            {expenses.map((expense) => (
              <li key={expense.id}>
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">
                  <span>{formatMonthLabel(expense.month)}</span>
                  <span>{expense.category}</span>
                </div>
                <ExpenseRow
                  expense={expense}
                  onRefresh={() => void load()}
                  onDelete={deleteExpense}
                  onToast={onToast}
                  onError={onError}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
