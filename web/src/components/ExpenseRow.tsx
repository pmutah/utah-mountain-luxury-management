import { useRef, useState } from 'react';
import { Eye, Hammer, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { api, formatCurrency, type Expense, type PaidBy } from '../lib/api';
import { expenseReceiptIsPdf, isMobileDevice } from '../lib/device';
import { formatPaidDate, paidDateFromExpense, stripPaidDatePrefix } from '../lib/paid-date';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { PAID_BY_LABELS, tracksPartnerContributions } from '../lib/paid-by';

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
  showPaidBy = false,
  variant = 'stack',
}: {
  expense: Expense;
  onDelete?: (id: string) => Promise<void>;
  onRefresh?: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  showMissingReceiptHint?: boolean;
  showPaidBy?: boolean;
  variant?: 'stack' | 'sheet';
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingPaidBy, setSavingPaidBy] = useState(false);
  const [savingPaidDate, setSavingPaidDate] = useState(false);

  const storedReceipt = hasStoredReceipt(expense);
  const receiptEndpoint = api.expenseReceiptUrl(expense.id);
  const pdfReceipt = storedReceipt && expenseReceiptIsPdf(expense);
  const mobilePdfLink = pdfReceipt && isMobileDevice();
  const canDelete = expense.id.startsWith('exp-') && onDelete;
  const canAttach = expense.id.startsWith('exp-') && !storedReceipt && onRefresh;
  const canTagPaidBy =
    showPaidBy &&
    expense.id.startsWith('exp-') &&
    tracksPartnerContributions(expense.propertyId) &&
    onRefresh;
  const title = expense.vendor || stripPaidDatePrefix(expense.note) || expense.category;
  const paidDate = paidDateFromExpense(expense);
  const detailNote =
    expense.vendor && expense.note && expense.note !== expense.vendor
      ? stripPaidDatePrefix(expense.note)
      : '';
  const subtitleParts = [
    paidDate ? `Paid ${formatPaidDate(paidDate)}` : null,
    detailNote || null,
    expense.stage ? expense.stage : null,
    expense.category !== 'Other' ? expense.category : null,
  ].filter(Boolean);

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

  const setPaidBy = async (paidBy: PaidBy) => {
    if (!onRefresh || expense.paidBy === paidBy) return;
    setSavingPaidBy(true);
    try {
      await api.updateExpense(expense.id, { paidBy });
      onToast(`Marked as ${PAID_BY_LABELS[paidBy]}`, 'success');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update who paid');
    } finally {
      setSavingPaidBy(false);
    }
  };

  const savePaidDate = async (next: string) => {
    if (!onRefresh || !next || next === paidDate) return;
    setSavingPaidDate(true);
    try {
      await api.updateExpense(expense.id, { paidDate: next });
      onToast(`Paid date set to ${formatPaidDate(next)}`, 'success');
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not update paid date');
    } finally {
      setSavingPaidDate(false);
    }
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

  const fileInput = (
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
  );

  const viewer = viewerOpen && viewerSrc && (
    <ReceiptViewerModal
      title={`${expense.vendor ?? expense.category} bill`}
      imageUrl={viewerSrc}
      openUrl={receiptEndpoint}
      contentType={viewerContentType}
      onClose={closeViewer}
    />
  );

  if (variant === 'sheet') {
    const iconBtn =
      'inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50';
    return (
      <>
        {fileInput}
        <tr className="border-b border-slate-800/70">
          <td className="py-2.5 pr-3 align-middle">
            {onRefresh && expense.id.startsWith('exp-') ? (
              <input
                type="date"
                value={paidDate ?? ''}
                disabled={savingPaidDate}
                onChange={(e) => void savePaidDate(e.target.value)}
                aria-label={`Paid date for ${title}`}
                className="w-full max-w-[9rem] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
              />
            ) : (
              <span className="text-xs text-slate-300 tabular-nums">{formatPaidDate(paidDate)}</span>
            )}
          </td>
          <td className="py-2.5 pr-6 align-middle min-w-[16rem] max-w-[28rem]">
            <span className="block font-bold text-slate-100 truncate">{title}</span>
            {detailNote ? (
              <span className="block text-[11px] text-slate-500 truncate">{detailNote}</span>
            ) : null}
          </td>
          <td className="py-2.5 pr-3 align-middle text-xs text-slate-500 truncate">
            {expense.stage || '—'}
          </td>
          <td className="py-2.5 pr-3 align-middle text-right font-black text-white tabular-nums">
            {formatCurrency(expense.amount)}
          </td>
          <td className="py-2.5 pr-3 align-middle">
            {canTagPaidBy ? (
              <div className="inline-flex gap-1">
                {(['brandon', 'todd'] as const).map((who) => (
                  <button
                    key={who}
                    type="button"
                    disabled={savingPaidBy}
                    onClick={() => void setPaidBy(who)}
                    className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                      expense.paidBy === who
                        ? who === 'brandon'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-500 hover:text-white'
                    }`}
                  >
                    {who === 'brandon' ? 'B&S' : 'Todd'}
                  </button>
                ))}
              </div>
            ) : expense.paidBy ? (
              <span className="text-[10px] font-black uppercase text-slate-500">
                {PAID_BY_LABELS[expense.paidBy]}
              </span>
            ) : (
              '—'
            )}
          </td>
          <td className="py-2.5 align-middle text-right whitespace-nowrap">
            <div className="inline-flex items-center justify-end gap-1">
              {canAttach && (
                <button
                  type="button"
                  disabled={attaching}
                  onClick={() => fileRef.current?.click()}
                  className={`${iconBtn} text-emerald-400`}
                  aria-label="Attach bill"
                  title="Attach bill"
                >
                  {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
              )}
              {storedReceipt && mobilePdfLink && (
                <a
                  href={receiptEndpoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${iconBtn} text-blue-400`}
                  aria-label="Open PDF"
                  title="Open PDF"
                >
                  <Eye className="w-4 h-4" />
                </a>
              )}
              {storedReceipt && !mobilePdfLink && (
                <button
                  type="button"
                  disabled={loadingReceipt}
                  onClick={() => void openReceipt()}
                  className={`${iconBtn} text-blue-400`}
                  aria-label={pdfReceipt ? 'View PDF' : 'View receipt'}
                  title={pdfReceipt ? 'View PDF' : 'View receipt'}
                >
                  {loadingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void remove()}
                  className={`${iconBtn} hover:text-red-400`}
                  aria-label="Delete expense"
                  title="Delete"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </td>
        </tr>
        {viewer}
      </>
    );
  }

  return (
    <>
      {fileInput}
      <div className="flex flex-col gap-3 text-sm mb-3 py-3 border-b border-slate-800/50 last:border-0">
        <div className="flex items-start justify-between gap-6">
          <span className="text-slate-400 flex items-start gap-2 min-w-0 flex-1 overflow-hidden">
            <Hammer className="w-3 h-3 shrink-0 mt-1" />
            <span className="min-w-0 overflow-hidden">
              <span className="block truncate pr-2">{title}</span>
              {subtitleParts.length > 0 && (
                <span className="block text-[10px] text-slate-600 font-bold mt-0.5 line-clamp-2">
                  {subtitleParts.join(' · ')}
                </span>
              )}
              {expense.paidBy && !canTagPaidBy && (
                <span
                  className={`block text-[10px] font-black uppercase tracking-widest mt-0.5 ${
                    expense.paidBy === 'brandon' ? 'text-blue-400' : 'text-slate-400'
                  }`}
                >
                  {PAID_BY_LABELS[expense.paidBy]}
                </span>
              )}
              {showMissingReceiptHint && !storedReceipt && expense.id.startsWith('exp-') && (
                <span className="block text-[10px] text-amber-500/90 font-bold mt-0.5">
                  Amount saved — tap Attach bill to add the PDF
                </span>
              )}
            </span>
          </span>
          <span className="font-black text-white tabular-nums shrink-0 text-right leading-6 min-w-[6.5rem]">
            {formatCurrency(expense.amount)}
          </span>
        </div>
        {(canTagPaidBy || canAttach || storedReceipt || canDelete) && (
        <div className="flex items-center gap-2 flex-wrap pl-5 pt-1">
          {canTagPaidBy && (
            <div className="flex gap-1">
              {(['brandon', 'todd'] as const).map((who) => (
                <button
                  key={who}
                  type="button"
                  disabled={savingPaidBy}
                  onClick={() => void setPaidBy(who)}
                  className={`px-2 py-2 min-h-[40px] rounded-xl text-[9px] font-black uppercase tracking-wider ${
                    expense.paidBy === who
                      ? who === 'brandon'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-600 text-white'
                      : 'bg-slate-800 text-slate-500 hover:text-white'
                  }`}
                >
                  {who === 'brandon' ? 'B&S' : 'Todd'}
                </button>
              ))}
            </div>
          )}
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
        </div>
        )}
      </div>
      {viewer}
    </>
  );
}
