import { useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileStack,
  Loader2,
  AlertCircle,
  Upload,
} from 'lucide-react';
import {
  api,
  formatCurrency,
  PROPERTIES,
  type BulkExpenseInput,
  type Expense,
  type ExpenseScanResult,
} from '../lib/api';
import { ExpenseRow } from './ExpenseRow';
import { applyPortfolioVendorNormalization } from '../lib/utility-vendors';

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

const MAX_BYTES = 10 * 1024 * 1024;

/** Drop charges tied to non-portfolio addresses (e.g. 53 North State Street on combined utility bills). */
function isExcludedExpense(e: { note?: string; vendor?: string }): boolean {
  return /53\s+n(orth)?\.?\s+state/i.test(`${e.note ?? ''} ${e.vendor ?? ''}`);
}

type FileStatus = 'pending' | 'scanning' | 'done' | 'failed';

type ReviewRow = ExpenseScanResult & {
  key: string;
  sourceFile: string;
  selected: boolean;
  propertyId: 'ranch' | 'lindon';
  receiptBase64: string;
  receiptMimeType: string;
};

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

function expenseFingerprint(e: {
  propertyId: string;
  month: string;
  vendor?: string;
  amount: number;
}) {
  return `${e.propertyId}|${e.month}|${(e.vendor ?? '').toLowerCase()}|${e.amount.toFixed(2)}`;
}

function canAutoSave(e: ExpenseScanResult): e is ExpenseScanResult & {
  propertyId: 'ranch' | 'lindon';
  month: string;
} {
  if (e.propertyId !== 'ranch' && e.propertyId !== 'lindon') return false;
  if (!/^\d{4}-\d{2}$/.test(e.month)) return false;
  if (!Number.isFinite(e.amount) || e.amount <= 0) return false;
  const confidence = e.confidence ?? (e.propertyId && e.month ? 'high' : 'low');
  return confidence !== 'low';
}

function toBulkInput(
  e: ExpenseScanResult & { propertyId: 'ranch' | 'lindon' },
  receipt: { base64: string; mimeType: string },
): BulkExpenseInput {
  return {
    propertyId: e.propertyId,
    month: e.month,
    category: e.category,
    amount: e.amount,
    note: e.note,
    vendor: e.vendor,
    receiptBase64: receipt.base64,
    receiptMimeType: receipt.mimeType,
  };
}

export function BatchBillImporter({
  expenses,
  onRefresh,
  onToast,
  onError,
}: {
  expenses: Expense[];
  onRefresh: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileRows, setFileRows] = useState<Array<{ name: string; status: FileStatus; detail?: string }>>(
    [],
  );
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [savingReview, setSavingReview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionKeys = useRef(new Set<string>());

  const savedImports = expenses
    .filter((e) => e.id.startsWith('exp-'))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  const deleteImport = async (id: string) => {
    await api.deleteExpense(id);
    onRefresh();
  };

  const processFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((f) => {
        const okType =
          f.type === 'application/pdf' || f.type.startsWith('image/') || f.name.endsWith('.pdf');
        if (!okType) {
          onError(`${f.name}: use PDF or image files only`);
          return false;
        }
        if (f.size > MAX_BYTES) {
          onError(`${f.name}: max file size is 10 MB`);
          return false;
        }
        return true;
      });
      if (valid.length === 0) return;

      setProcessing(true);
      setFileRows(valid.map((f) => ({ name: f.name, status: 'pending' as FileStatus })));
      const needsReview: ReviewRow[] = [];
      let autoSaved = 0;

      for (let i = 0; i < valid.length; i++) {
        const file = valid[i]!;
        setFileRows((rows) =>
          rows.map((r, idx) => (idx === i ? { ...r, status: 'scanning' } : r)),
        );

        try {
          const { base64, mimeType } = await fileToBase64(file);
          const fileReceipt = { base64, mimeType };
          const { expenses } = await api.scanExpenseBatch({
            fileBase64: base64,
            mimeType,
            fileName: file.name,
          });

          const portfolioExpenses = expenses
            .filter((e) => !isExcludedExpense(e))
            .map((e) => applyPortfolioVendorNormalization(e, { fileName: file.name }));

          let filePdfWarnings = 0;

          for (const expense of portfolioExpenses) {
            if (!canAutoSave(expense)) continue;
            const key = expenseFingerprint(expense);
            if (sessionKeys.current.has(key)) continue;

            try {
              const result = await api.addExpense(toBulkInput(expense, fileReceipt));
              sessionKeys.current.add(key);
              autoSaved++;
              if (result.receiptWarning) filePdfWarnings++;
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Save failed';
              onError(msg);
              setFileRows((rows) =>
                rows.map((r, idx) =>
                  idx === i ? { ...r, status: 'failed' as FileStatus, detail: msg } : r,
                ),
              );
              break;
            }
          }

          if (filePdfWarnings > 0 && autoSaved > 0) {
            onToast(
              `${filePdfWarnings} saved without a bill file — use Attach bill on each row to add the PDF`,
              'info',
            );
          }

          for (const expense of portfolioExpenses) {
            if (canAutoSave(expense)) continue;
            needsReview.push({
              ...expense,
              key: `${file.name}-${needsReview.length}-${expense.amount}`,
              sourceFile: file.name,
              selected: true,
              receiptBase64: base64,
              receiptMimeType: mimeType,
              propertyId:
                expense.propertyId === 'lindon' || expense.propertyId === 'ranch'
                  ? expense.propertyId
                  : 'ranch',
              month: expense.month,
              category: expense.category || 'Other',
            });
          }

          setFileRows((rows) =>
            rows.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: 'done' as FileStatus,
                    detail: `${portfolioExpenses.length} bill(s) found${expenses.length > portfolioExpenses.length ? ` (${expenses.length - portfolioExpenses.length} non-portfolio skipped)` : ''}`,
                  }
                : r,
            ),
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Scan failed';
          setFileRows((rows) =>
            rows.map((r, idx) =>
              idx === i ? { ...r, status: 'failed' as FileStatus, detail: msg } : r,
            ),
          );
        }
      }

      setReviewRows((prev) => [...prev, ...needsReview]);
      setProcessing(false);
      onRefresh();

      if (autoSaved > 0) {
        onToast(`Saved ${autoSaved} bill${autoSaved === 1 ? '' : 's'}`, 'success');
      }
      if (needsReview.length > 0) {
        onToast(`${needsReview.length} item(s) need review below`, 'info');
      }
    },
    [onError, onRefresh, onToast],
  );

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    void processFiles(Array.from(list));
  };

  const saveReview = async () => {
    const selected = reviewRows.filter((r) => r.selected);
    if (selected.length === 0) {
      setReviewRows([]);
      return;
    }
    setSavingReview(true);
    try {
      let savedCount = 0;
      let pdfWarnings = 0;
      for (const r of selected) {
        const result = await api.addExpense({
          propertyId: r.propertyId,
          month: r.month,
          category: r.category,
          amount: r.amount,
          note: r.note,
          vendor: r.vendor,
          receiptBase64: r.receiptBase64,
          receiptMimeType: r.receiptMimeType,
        });
        sessionKeys.current.add(expenseFingerprint(result));
        savedCount++;
        if (result.receiptWarning) pdfWarnings++;
      }
      setReviewRows([]);
      onRefresh();
      if (savedCount > 0) {
        onToast(`Saved ${savedCount} bill${savedCount === 1 ? '' : 's'}`, 'success');
      }
      if (pdfWarnings > 0) {
        onToast(
          'Some bills saved without PDF — add FIREBASE_SERVICE_ACCOUNT_JSON in Cloudflare Pages',
          'info',
        );
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save expenses');
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-6 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <FileStack className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-white">
              Import bills (PDF)
            </p>
            <p className="text-[10px] text-slate-500 font-bold mt-1">
              Drop Rocky Mountain Power PDFs — saves bill file, amount &amp; vendor
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-500 font-bold">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPickFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
              dragOver ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/50'
            }`}
          >
            {processing ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-xs font-bold uppercase tracking-widest">Processing files…</p>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-slate-500 mb-3" />
                <p className="text-sm font-bold text-slate-300 mb-4">
                  Drop PDF bills here (multiple files OK)
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 bg-emerald-600 rounded-xl text-xs font-black uppercase min-h-[44px]"
                >
                  Choose files
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </>
            )}
          </div>

          {fileRows.length > 0 && (
            <ul className="space-y-2">
              {fileRows.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center gap-3 text-sm bg-slate-950/60 rounded-xl px-3 py-2"
                >
                  {row.status === 'scanning' && (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
                  )}
                  {row.status === 'done' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  {row.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  {row.status === 'pending' && (
                    <span className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span className="truncate flex-1 text-slate-300">{row.name}</span>
                  {row.detail && (
                    <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">
                      {row.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {reviewRows.length > 0 && (
            <div className="p-4 bg-slate-950 rounded-2xl border border-amber-800/40 space-y-3">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                Needs review ({reviewRows.length})
              </p>
              {reviewRows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800"
                >
                  <label className="flex items-center gap-2 col-span-full text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        setReviewRows((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, selected: e.target.checked } : r,
                          ),
                        )
                      }
                    />
                    {row.sourceFile}
                  </label>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">
                    Property
                    <select
                      value={row.propertyId}
                      onChange={(e) =>
                        setReviewRows((rows) =>
                          rows.map((r) =>
                            r.key === row.key
                              ? { ...r, propertyId: e.target.value as 'ranch' | 'lindon' }
                              : r,
                          ),
                        )
                      }
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    >
                      <option value="ranch">{PROPERTIES.ranch.name}</option>
                      <option value="lindon">{PROPERTIES.lindon.name}</option>
                    </select>
                  </label>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">
                    Month
                    <input
                      type="month"
                      value={row.month}
                      onChange={(e) =>
                        setReviewRows((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, month: e.target.value } : r,
                          ),
                        )
                      }
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">
                    Amount
                    <input
                      type="number"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) =>
                        setReviewRows((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, amount: Number(e.target.value) } : r,
                          ),
                        )
                      }
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label className="text-[9px] text-slate-500 uppercase font-bold">
                    Category
                    <select
                      value={row.category}
                      onChange={(e) =>
                        setReviewRows((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, category: e.target.value } : r,
                          ),
                        )
                      }
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  {row.vendor && (
                    <p className="text-xs text-slate-400 col-span-full">Vendor: {row.vendor}</p>
                  )}
                  <p className="text-xs font-black text-white col-span-full">
                    {formatCurrency(row.amount)}
                  </p>
                </div>
              ))}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setReviewRows([])}
                  className="px-4 py-2 text-xs font-black uppercase text-slate-400"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={savingReview}
                  onClick={() => void saveReview()}
                  className="px-6 py-2 bg-emerald-600 disabled:opacity-40 rounded-xl text-xs font-black uppercase min-h-[44px]"
                >
                  {savingReview ? 'Saving…' : 'Save selected'}
                </button>
              </div>
            </div>
          )}

          {savedImports.length > 0 && (
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Saved bill imports
              </p>
              <p className="text-xs text-slate-500 mb-3">
                <span className="text-emerald-400 font-bold">Attach bill</span> adds a PDF you already
                imported (for older rows). <span className="text-blue-400 font-bold">View PDF</span>{' '}
                opens the stored file.
              </p>
              {savedImports.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  showMissingReceiptHint
                  onRefresh={onRefresh}
                  onDelete={deleteImport}
                  onError={onError}
                  onToast={onToast}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
