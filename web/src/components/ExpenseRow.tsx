import { useState } from 'react';
import { Hammer, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { ReceiptViewerModal } from './ReceiptViewerModal';

export function ExpenseRow({
  expense,
  onDelete,
  onError,
  onToast,
}: {
  expense: Expense;
  onDelete?: (id: string) => Promise<void>;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasReceipt = Boolean(expense.receiptStoragePath || expense.receiptUrl);
  const receiptSrc = expense.receiptUrl ?? api.expenseReceiptUrl(expense.id);
  const canDelete = expense.id.startsWith('exp-') && onDelete;

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
      <div className="flex justify-between items-center text-sm mb-2 gap-2 group">
        <span className="text-slate-400 flex items-center gap-2 min-w-0 flex-1">
          <Hammer className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {expense.vendor ? `${expense.vendor} · ` : ''}
            {expense.category}
            {expense.note ? ` — ${expense.note}` : ''}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {hasReceipt && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="p-1 rounded-lg bg-slate-800 text-blue-400 hover:bg-slate-700 overflow-hidden"
              title="View receipt"
            >
              {expense.receiptContentType?.startsWith('image/') ? (
                <img src={receiptSrc} alt="" className="w-8 h-8 object-cover rounded" />
              ) : (
                <ImageIcon className="w-4 h-4 m-1" />
              )}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete expense"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
          <span className="font-black text-white">{formatCurrency(expense.amount)}</span>
        </div>
      </div>
      {viewerOpen && (
        <ReceiptViewerModal
          title={`${expense.category} receipt`}
          imageUrl={receiptSrc}
          contentType={expense.receiptContentType}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
