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
import { currentYearMonth } from '../lib/months';
import { todayInUtah } from '../lib/paid-date';
import { fileFromClipboard, isChatPasteTarget, prepareReceiptFile } from '../lib/receipt-image';
import { HouseholdExpenseRow } from './HouseholdExpenseRow';

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
  const [itemPhotos, setItemPhotos] = useState<
    Array<{ base64: string; mimeType: string; name: string; previewUrl: string }>
  >([]);
  const itemPhotoRef = useRef<HTMLInputElement>(null);
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
    setItemPhotos([]);
  };

  const saveExpense = async (input: {
    what: string;
    value: number;
    category: (typeof CATEGORIES)[number];
    receipt?: { base64: string; mimeType: string } | null;
    photos?: Array<{ base64: string; mimeType: string }>;
  }) => {
    const paidDate = todayInUtah();
    const saved = await api.addExpense({
      propertyId: HOUSEHOLD_PROPERTY_ID,
      month: paidDate.slice(0, 7) || currentYearMonth(),
      category: input.category,
      amount: input.value,
      note: input.what,
      paidBy: 'brandon',
      paidDate,
      receiptBase64: input.receipt?.base64,
      receiptMimeType: input.receipt?.mimeType,
    });
    if (saved.receiptWarning) onToast(saved.receiptWarning, 'info');
    for (const photo of input.photos ?? []) {
      try {
        await api.addExpensePhoto(saved.id, {
          imageBase64: photo.base64,
          mimeType: photo.mimeType,
        });
      } catch {
        onToast('Expense saved, but one item photo did not attach', 'info');
      }
    }
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
      await saveExpense({ what, value, category, receipt, photos: itemPhotos });
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
    <div className="space-y-4" data-bot="our-expenses">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white">Our expenses</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Brandon &amp; Stephanie furnishings for the house. Photo, paste, or type — stays off the
            rental P&amp;L.
          </p>
        </div>
        <div className="bg-rose-950/40 px-4 py-3 rounded-2xl border border-rose-800/50 min-w-[10rem]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">We have put in</p>
          <p className="text-2xl font-black text-rose-300 mt-0.5">{formatCurrency(total)}</p>
          <p className="text-[10px] text-slate-500 font-bold">
            {expenses.length} {expenses.length === 1 ? 'purchase' : 'purchases'}
          </p>
        </div>
      </div>

      <section className="bg-slate-900 p-4 sm:p-5 rounded-3xl border border-rose-800/40">
        <div className="flex items-center gap-2 mb-3">
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
          className={`border-2 border-dashed rounded-xl px-3 py-3 text-center mb-3 transition-colors ${
            dragOver ? 'border-rose-400 bg-rose-500/10' : 'border-slate-700 bg-slate-950/50'
          }`}
        >
          {scanning ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-1">
              <Loader2 className="w-5 h-5 animate-spin text-rose-400" />
              <p className="text-xs font-bold uppercase tracking-widest">Reading receipt…</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <p className="text-xs font-bold text-slate-400">
                Photo, paste (Ctrl+V), or type below
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 bg-slate-800 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 min-h-[36px]"
              >
                <ImagePlus className="w-3.5 h-3.5" /> Upload
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="px-3 py-1.5 bg-rose-700 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 min-h-[36px] text-white"
              >
                <Camera className="w-3.5 h-3.5" /> Camera
              </button>
              {receipt && (
                <p className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                  Attached: {receipt.name}
                </p>
              )}
            </div>
          )}
          {receipt?.previewUrl && (
            <img
              src={receipt.previewUrl}
              alt="Receipt preview"
              className="mt-2 mx-auto max-h-24 object-contain rounded-lg border border-slate-700 bg-slate-950"
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

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <label className="text-[10px] font-bold text-slate-500 uppercase flex-1">
            <span className="inline-flex items-center gap-1">
              <Type className="w-3 h-3" /> Paste receipt text
            </span>
            <textarea
              data-bot="ours-expense-text"
              value={receiptText}
              onChange={(e) => setReceiptText(e.target.value)}
              placeholder="e.g. Wayfair dresser $899"
              rows={2}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-sm text-white placeholder:text-slate-600 resize-none"
            />
          </label>
          <button
            type="button"
            data-bot="ours-expense-read-text"
            disabled={!receiptText.trim() || scanning}
            onClick={() => void readPastedText(receiptText)}
            className="self-end px-3 py-2 bg-rose-700 disabled:opacity-40 rounded-xl text-[10px] font-black uppercase min-h-[36px] text-white"
          >
            Read text
          </button>
        </div>

        <form
          className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="text-[10px] font-bold text-slate-500 uppercase">
            What it was
            <input
              data-bot="ours-expense-what"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Master dresser, Costco towels"
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white placeholder:text-slate-600"
            />
          </label>
          <label className="text-[10px] font-bold text-slate-500 uppercase">
            Amount
            <div className="mt-1 flex items-center bg-slate-950 rounded-xl px-3 py-2 border border-slate-700">
              <span className="text-slate-500 mr-1 font-bold">$</span>
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
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-2 py-2 text-sm font-bold text-white"
            >
              {CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            data-bot="ours-expense-save"
            disabled={saving || scanning}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase min-h-[36px] bg-rose-600 text-white disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>

        <div className="mt-4 rounded-2xl border border-dashed border-rose-800/50 bg-rose-950/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-200 mb-2">
            Item photos
          </p>
          <p className="text-xs text-slate-500 mb-2">
            Pictures of the thing itself — not the receipt. You can add more after you save.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {itemPhotos.map((photo, index) => (
              <div key={`${photo.name}-${index}`} className="relative">
                {photo.previewUrl ? (
                  <img
                    src={photo.previewUrl}
                    alt=""
                    className="h-16 w-16 object-cover rounded-lg border border-slate-700"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-slate-700 bg-slate-950" />
                )}
                <button
                  type="button"
                  onClick={() => setItemPhotos((prev) => prev.filter((_, i) => i !== index))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-slate-300 border border-slate-600 text-[10px] font-black"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => itemPhotoRef.current?.click()}
              className="h-16 px-3 rounded-lg border border-dashed border-rose-800/70 text-[10px] font-black uppercase tracking-wider text-rose-200 inline-flex items-center gap-1.5"
            >
              <ImagePlus className="w-4 h-4" />
              Add photos
            </button>
            <input
              ref={itemPhotoRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? [...e.target.files] : [];
                void (async () => {
                  const next: Array<{
                    base64: string;
                    mimeType: string;
                    name: string;
                    previewUrl: string;
                  }> = [];
                  for (const file of files) {
                    next.push(await prepareReceiptFile(file));
                  }
                  setItemPhotos((prev) => [...prev, ...next]);
                })();
                if (itemPhotoRef.current) itemPhotoRef.current.value = '';
              }}
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-800">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-3">
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
          <div className="overflow-x-auto">
            <table className="w-max max-w-full border-collapse text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-3 font-black">Paid</th>
                  <th className="text-left py-2 pr-3 font-black">What / photos</th>
                  <th className="text-left py-2 pr-3 font-black">Type</th>
                  <th className="text-right py-2 pr-3 font-black">Amount</th>
                  <th className="text-left py-2 pr-3 font-black">Who</th>
                  <th className="text-right py-2 font-black">Bill</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <HouseholdExpenseRow
                    key={expense.id}
                    expense={expense}
                    onRefresh={() => void load()}
                    onDelete={deleteExpense}
                    onToast={onToast}
                    onError={onError}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
