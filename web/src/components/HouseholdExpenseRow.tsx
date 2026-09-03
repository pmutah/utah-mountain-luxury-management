import { useEffect, useRef, useState } from 'react';
import { Eye, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { formatPaidDate, paidDateFromExpense, stripPaidDatePrefix } from '../lib/paid-date';
import { prepareReceiptFile } from '../lib/receipt-image';
import { ReceiptViewerModal } from './ReceiptViewerModal';

const CATEGORIES = ['Furnishings', 'Decor', 'Supplies', 'Other'] as const;

function hasStoredReceipt(expense: Expense): boolean {
  return Boolean(expense.receiptStoragePath || expense.receiptUrl);
}

export function HouseholdExpenseRow({
  expense,
  onRefresh,
  onDelete,
  onToast,
  onError,
}: {
  expense: Expense;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void>;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [what, setWhat] = useState(stripPaidDatePrefix(expense.note) || expense.vendor || '');
  const [amount, setAmount] = useState(String(expense.amount));
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState('Photo');

  useEffect(() => {
    setWhat(stripPaidDatePrefix(expense.note) || expense.vendor || '');
    setAmount(String(expense.amount));
  }, [expense.id, expense.note, expense.vendor, expense.amount]);

  const paidDate = paidDateFromExpense(expense);
  const photos = expense.itemPhotos ?? [];
  const storedReceipt = hasStoredReceipt(expense);

  const persist = async (patch: { note?: string; amount?: number; paidDate?: string; category?: string }) => {
    setSaving(true);
    try {
      await api.updateExpense(expense.id, patch);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update expense');
    } finally {
      setSaving(false);
    }
  };

  const saveWhat = async () => {
    const next = what.trim();
    const current = stripPaidDatePrefix(expense.note) || expense.vendor || '';
    if (!next || next === current) return;
    await persist({ note: next });
    onToast('Updated what it was', 'success');
  };

  const saveAmount = async () => {
    const next = Number(amount);
    if (!Number.isFinite(next) || next <= 0) {
      onError('Enter a dollar amount');
      setAmount(String(expense.amount));
      return;
    }
    if (next === expense.amount) return;
    await persist({ amount: next });
    onToast(`Price set to ${formatCurrency(next)}`, 'success');
  };

  const addPhotos = async (files: FileList | File[] | null) => {
    const list = files ? [...files] : [];
    if (!list.length) return;
    setAttaching(true);
    try {
      for (const file of list) {
        const prepared = await prepareReceiptFile(file);
        await api.addExpensePhoto(expense.id, {
          imageBase64: prepared.base64,
          mimeType: prepared.mimeType,
        });
      }
      onToast(list.length === 1 ? 'Item photo added' : `${list.length} item photos added`, 'success');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not add item photo');
    } finally {
      setAttaching(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  const removePhoto = async (photoId: string) => {
    try {
      await api.deleteExpensePhoto(expense.id, photoId);
      onToast('Photo removed', 'success');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not remove photo');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete this expense (${formatCurrency(expense.amount)})?`)) return;
    setDeleting(true);
    try {
      await onDelete(expense.id);
      onToast('Expense removed', 'success');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not delete expense');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr className="border-b border-slate-800/70 align-top">
      <td className="py-2.5 pr-3">
        <input
          type="date"
          value={paidDate ?? ''}
          disabled={saving}
          onChange={(e) => {
            if (e.target.value) void persist({ paidDate: e.target.value });
          }}
          aria-label={`Paid date for ${what}`}
          className="w-full max-w-[9rem] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
        />
        <p className="text-[10px] text-slate-600 font-bold mt-1">{formatPaidDate(paidDate)}</p>
      </td>
      <td className="py-2.5 pr-3 min-w-[16rem] max-w-[28rem]">
        <input
          value={what}
          disabled={saving}
          onChange={(e) => setWhat(e.target.value)}
          onBlur={() => void saveWhat()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-bold text-white"
        />
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setViewerTitle(what || 'Item photo');
                    setViewerSrc(photo.url || api.expensePhotoUrl(expense.id, photo.id));
                  }}
                  className="block"
                >
                  <img
                    src={photo.url || api.expensePhotoUrl(expense.id, photo.id)}
                    alt=""
                    className="h-16 w-16 object-cover rounded-lg border border-slate-700 bg-slate-950"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void removePhoto(photo.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-slate-300 border border-slate-600 flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={attaching}
              onClick={() => photoRef.current?.click()}
              className="h-16 min-w-[4rem] px-2 rounded-lg border border-dashed border-rose-800/70 bg-rose-950/20 text-rose-200 text-[10px] font-black uppercase tracking-wider inline-flex flex-col items-center justify-center gap-1"
            >
              {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              Photo
            </button>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void addPhotos(e.target.files)}
          />
        </div>
      </td>
      <td className="py-2.5 pr-3">
        <select
          value={expense.category}
          disabled={saving}
          onChange={(e) => void persist({ category: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
        >
          {[...CATEGORIES, expense.category]
            .filter((name, index, all) => all.indexOf(name) === index)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <div className="inline-flex items-center bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
          <span className="text-slate-500 mr-1 text-xs font-bold">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            disabled={saving}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => void saveAmount()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-20 bg-transparent border-none text-sm font-black text-white text-right p-0 outline-none"
          />
        </div>
      </td>
      <td className="py-2.5 pr-3 text-[10px] font-black uppercase text-slate-500">B&amp;S</td>
      <td className="py-2.5 text-right whitespace-nowrap">
        <div className="inline-flex items-center justify-end gap-1">
          {storedReceipt && (
            <button
              type="button"
              onClick={() => {
                setViewerTitle('Receipt');
                setViewerSrc(api.expenseReceiptUrl(expense.id));
              }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-blue-400 hover:text-white hover:bg-slate-800"
              aria-label="View receipt"
              title="View receipt"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            disabled={deleting}
            onClick={() => void remove()}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
            aria-label="Delete expense"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
        {viewerSrc && (
          <ReceiptViewerModal
            title={viewerTitle}
            imageUrl={viewerSrc}
            openUrl={viewerSrc}
            contentType={viewerTitle === 'Receipt' ? expense.receiptContentType ?? null : 'image/jpeg'}
            onClose={() => setViewerSrc(null)}
          />
        )}
      </td>
    </tr>
  );
}
