import { useState } from 'react';
import { Hammer, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { ReceiptViewerModal } from './ReceiptViewerModal';

export function ExpenseRow({
  expense,
  onChanged,
  onError,
  onToast,
}: {
  expense: Expense;
  onChanged: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasReceipt = Boolean(expense.receiptStoragePath || expense.receiptUrl);
  const imageUrl = expense.receiptUrl ?? api.receiptUrl(expense.id);

  const remove = async () => {
    if (!window.confirm(`Delete ${expense.category} (${formatCurrency(expense.amount)})?`)) return;
    setDeleting(true);
    try {
      await api.deleteExpense(expense.id);
      onToast('Expense deleted', 'success');
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to delete expense');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-center text-sm mb-2 gap-2">
        <span className="text-slate-400 flex items-center gap-2 min-w-0">
          <Hammer className="w-3 h-3 shrink-0" />
          <span className="truncate">{expense.category}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {hasReceipt && (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="p-1.5 rounded-lg bg-slate-800 text-blue-400 hover:bg-slate-700"
              title="View receipt"
            >
              {expense.receiptUrl ? (
                <img
                  src={expense.receiptUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover"
                />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </button>
          )}
          {expense.id.startsWith('exp-') && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
              title="Delete expense"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
          <span className="font-black text-white">{formatCurrency(expense.amount)}</span>
        </div>
      </div>
      {viewerOpen && (
        <ReceiptViewerModal
          title={`${expense.category} receipt`}
          imageUrl={imageUrl}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
