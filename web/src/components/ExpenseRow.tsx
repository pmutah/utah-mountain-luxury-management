import { useState } from 'react';
import { Eye, Hammer, Loader2, Trash2 } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { ReceiptViewerModal } from './ReceiptViewerModal';

function hasStoredReceipt(expense: Expense): boolean {
  return Boolean(expense.receiptStoragePath || expense.receiptUrl);
}

export function ExpenseRow({
  expense,
  onDelete,
  onError,
  onToast,
  showMissingReceiptHint = false,
}: {
  expense: Expense;
  onDelete?: (id: string) => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  /** When true, show a note if this import has no saved PDF/image */
  showMissingReceiptHint?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const storedReceipt = hasStoredReceipt(expense);
  const receiptEndpoint = api.expenseReceiptUrl(expense.id);
  const canDelete = expense.id.startsWith('exp-') && onDelete;

  const openReceipt = async () => {
    setLoadingReceipt(true);
    try {
      const res = await fetch(receiptEndpoint, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'No bill file is saved for this expense.'
            : 'Could not load the bill file.',
        );
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setViewerSrc(objectUrl);
      setViewerContentType(blob.type || expense.receiptContentType || null);
      setViewerOpen(true);
    } catch (e) {
      onToast(
        e instanceof Error
          ? `${e.message} Re-import the PDF if you need it on file.`
          : 'Could not open bill file.',
        'info',
      );
    } finally {
      setLoadingReceipt(false);
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    if (viewerSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerSrc);
    }
    setViewerSrc(null);
    setViewerContentType(null);
  };

  const remove = async () => {
    if (!onDelete || !window.confirm(`Delete this expense (${formatCurrency(expense.amount)})?`)) return;
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
    <>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm mb-3 py-2 border-b border-slate-800/50 last:border-0">
        <span className="text-slate-400 flex items-center gap-2 min-w-0">
          <Hammer className="w-3 h-3 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">
              {expense.vendor ? `${expense.vendor} · ` : ''}
              {expense.category}
              {expense.note ? ` — ${expense.note}` : ''}
            </span>
            {showMissingReceiptHint && !storedReceipt && expense.id.startsWith('exp-') && (
              <span className="block text-[10px] text-amber-500/90 font-bold mt-0.5">
                Amount saved — no PDF on file (re-import to attach bill)
              </span>
            )}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {(storedReceipt || expense.id.startsWith('exp-')) && (
            <button
              type="button"
              disabled={loadingReceipt}
              onClick={() => void openReceipt()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider"
            >
              {loadingReceipt ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {expense.receiptContentType === 'application/pdf' ||
              (!expense.receiptContentType?.startsWith('image/') && storedReceipt)
                ? 'View PDF'
                : 'View receipt'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700"
              aria-label="Delete expense"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              <span className="text-[10px] font-black uppercase">Delete</span>
            </button>
          )}
          <span className="font-black text-white tabular-nums min-w-[4.5rem] text-right">
            {formatCurrency(expense.amount)}
          </span>
        </div>
      </div>
      {viewerOpen && viewerSrc && (
        <ReceiptViewerModal
          title={`${expense.vendor ?? expense.category} bill`}
          imageUrl={viewerSrc}
          contentType={viewerContentType}
          onClose={closeViewer}
        />
      )}
    </>
  );
}
