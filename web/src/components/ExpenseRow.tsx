import { useRef, useState } from 'react';
import { Eye, Hammer, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { api, formatCurrency, type Expense } from '../lib/api';
import { expenseReceiptIsPdf, isMobileDevice } from '../lib/device';
import { ReceiptViewerModal } from './ReceiptViewerModal';

function hasStoredReceipt(expense: Expense): boolean {
  return Boolean(expense.receiptStoragePath || expense.receiptUrl);
}

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

export function ExpenseRow({
  expense,
  onDelete,
  onRefresh,
  onError,
  onToast,
  showMissingReceiptHint = false,
}: {
  expense: Expense;
  onDelete?: (id: string) => Promise<void>;
  onRefresh?: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  showMissingReceiptHint?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const storedReceipt = hasStoredReceipt(expense);
  const receiptEndpoint = api.expenseReceiptUrl(expense.id);
  const pdfReceipt = storedReceipt && expenseReceiptIsPdf(expense);
  const mobilePdfLink = pdfReceipt && isMobileDevice();
  const canDelete = expense.id.startsWith('exp-') && onDelete;
  const canAttach = expense.id.startsWith('exp-') && !storedReceipt && onRefresh;

  const viewButtonClass =
    'inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider';

  const openReceipt = async () => {
    if (pdfReceipt) {
      setViewerSrc(receiptEndpoint);
      setViewerContentType('application/pdf');
      setViewerOpen(true);
      return;
    }

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
          ? `${e.message} Use Attach bill to add the PDF without re-scanning.`
          : 'Could not open bill file.',
        'info',
      );
    } finally {
      setLoadingReceipt(false);
    }
  };

  const attachFile = async (file: File) => {
    setAttaching(true);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      await api.attachExpenseReceipt(expense.id, { receiptBase64: base64, receiptMimeType: mimeType });
      onToast('Bill file attached', 'success');
      onRefresh?.();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not attach bill');
    } finally {
      setAttaching(false);
      if (fileRef.current) fileRef.current.value = '';
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
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void attachFile(file);
        }}
      />
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
                Amount saved — tap Attach bill to add the PDF
              </span>
            )}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {canAttach && (
            <button
              type="button"
              disabled={attaching}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider"
            >
              {attaching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
              Attach bill
            </button>
          )}
          {storedReceipt && mobilePdfLink && (
            <a
              href={receiptEndpoint}
              target="_blank"
              rel="noopener noreferrer"
              className={viewButtonClass}
            >
              <Eye className="w-4 h-4" />
              Open PDF
            </a>
          )}
          {storedReceipt && !mobilePdfLink && (
            <button
              type="button"
              disabled={loadingReceipt}
              onClick={() => void openReceipt()}
              className={viewButtonClass}
            >
              {loadingReceipt ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {pdfReceipt ? 'View PDF' : 'View receipt'}
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
          openUrl={receiptEndpoint}
          contentType={viewerContentType}
          onClose={closeViewer}
        />
      )}
    </>
  );
}
