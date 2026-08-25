import { useMemo, useRef, useState } from 'react';
import { Camera, FileText, Loader2, Plus } from 'lucide-react';
import {
  api,
  formatCurrency,
  type Expense,
  type PaidBy,
} from '../lib/api';
import { CONSTRUCTION_STAGES } from '../lib/construction-stages';
import { currentYearMonth } from '../lib/months';
import { PAID_BY_LABELS, summarizePartnerContributions } from '../lib/paid-by';
import { ExpenseRow } from './ExpenseRow';

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

type PhaseFilter = 'all' | string;

export function ConstructionPartnerLedger({
  expenses,
  onRefresh,
  onError,
  onToast,
}: {
  expenses: Expense[];
  onRefresh: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('all');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<PaidBy>('brandon');
  const [stage, setStage] = useState<string>(CONSTRUCTION_STAGES[0]);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const constructionExpenses = useMemo(
    () =>
      expenses
        .filter((e) => e.propertyId === 'construction' && e.id.startsWith('exp-'))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [expenses],
  );

  const filtered = useMemo(
    () =>
      phaseFilter === 'all'
        ? constructionExpenses
        : constructionExpenses.filter((e) => (e.stage ?? '') === phaseFilter),
    [constructionExpenses, phaseFilter],
  );

  const summary = useMemo(
    () => summarizePartnerContributions(filtered, 'construction'),
    [filtered],
  );

  const toddRows = filtered.filter((e) => e.paidBy === 'todd');
  const brandonRows = filtered.filter((e) => e.paidBy === 'brandon');
  const unassignedRows = filtered.filter((e) => e.paidBy !== 'todd' && e.paidBy !== 'brandon');

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { base64, mimeType } = await fileToBase64(file);
      setReceipt({ base64, mimeType, name: file.name });
    } catch {
      onError('Could not read that receipt file');
    }
  };

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
      const saved = await api.addExpense({
        propertyId: 'construction',
        month: currentYearMonth(),
        category: 'Construction',
        amount: value,
        note: what,
        stage,
        paidBy,
        receiptBase64: receipt?.base64,
        receiptMimeType: receipt?.mimeType,
      });
      if (saved.receiptWarning) onToast(saved.receiptWarning, 'info');
      setDescription('');
      setAmount('');
      setReceipt(null);
      onRefresh();
      onToast(`Logged ${formatCurrency(value)} for ${PAID_BY_LABELS[paidBy]}`, 'success');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  const settlement =
    summary.totalAssigned <= 0
      ? 'No tagged construction bills yet.'
      : summary.toddStillOwes > 0.005
        ? `Todd still needs to contribute ${formatCurrency(summary.toddStillOwes)} to stay 50/50.`
        : summary.toddStillOwes < -0.005
          ? `Brandon & Stephanie still need to contribute ${formatCurrency(Math.abs(summary.toddStillOwes))} to stay 50/50.`
          : 'Contributions are even.';

  return (
    <section data-bot="partner-spend" className="bg-slate-900 rounded-[40px] border border-amber-800/40 p-6">
      <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">
        Partner spend
      </h3>
      <p className="text-xs text-slate-500 mb-6">
        Track what Todd paid versus what Brandon &amp; Stephanie paid. Attach a photo or PDF of the
        receipt. Tag a construction phase so you can filter later. These bills stay off the rental
        P&amp;L.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-950/70 p-5 rounded-3xl border border-slate-700">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Todd</p>
          <p className="text-2xl font-black text-white mt-1">{formatCurrency(summary.todd)}</p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            {summary.toddCount} {summary.toddCount === 1 ? 'receipt' : 'receipts'}
          </p>
        </div>
        <div className="bg-slate-950/70 p-5 rounded-3xl border border-amber-800/40">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Brandon &amp; Stephanie
          </p>
          <p className="text-2xl font-black text-amber-400 mt-1">{formatCurrency(summary.brandon)}</p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            {summary.brandonCount} {summary.brandonCount === 1 ? 'receipt' : 'receipts'}
          </p>
        </div>
      </div>
      <p className="text-sm font-black text-white mb-6">{settlement}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setPhaseFilter('all')}
          className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider min-h-[36px] ${
            phaseFilter === 'all' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          All phases
        </button>
        {CONSTRUCTION_STAGES.map((name) => (
          <button
            key={name}
            type="button"
            data-bot={`phase-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            onClick={() => setPhaseFilter(name)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider min-h-[36px] ${
              phaseFilter === name ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="p-6 rounded-[24px] border border-amber-800/50 bg-amber-950/20 flex flex-col gap-4 mb-8">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-amber-400" />
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Add expense
          </p>
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
            <input
              type="text"
              data-bot="expense-what"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Framing lumber, sofa, plumber"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white placeholder:text-slate-600"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Amount
              <div className="mt-1 flex items-center bg-slate-900 rounded-xl px-3 py-2 border border-slate-700">
                <span className="text-slate-500 mr-2 font-bold">$</span>
                <input
                  data-bot="expense-amount"
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
              Phase
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white"
              >
                {CONSTRUCTION_STAGES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-[10px] font-bold text-slate-500 uppercase">Who paid</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['todd', 'brandon'] as const).map((who) => (
                <button
                  key={who}
                  data-bot={`paid-by-${who}`}
                  type="button"
                  onClick={() => setPaidBy(who)}
                  className={`px-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
                    paidBy === who ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'
                  }`}
                >
                  {PAID_BY_LABELS[who]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-amber-300 text-xs font-black uppercase min-h-[44px]"
            >
              <Camera className="w-4 h-4" />
              Photo of receipt
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-black uppercase min-h-[44px]"
            >
              <FileText className="w-4 h-4" />
              PDF or image
            </button>
            {receipt && (
              <span className="self-center text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                Attached: {receipt.name}
              </span>
            )}
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />

          <button
            type="submit"
            data-bot="expense-save"
            disabled={saving}
            className="self-end px-6 py-3 rounded-xl text-xs font-black uppercase min-h-[44px] bg-amber-600 text-white disabled:opacity-40"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </span>
            ) : (
              'Save expense'
            )}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LedgerColumn
          title="Todd paid"
          rows={toddRows}
          empty="No Todd receipts in this phase yet."
          onRefresh={onRefresh}
          onError={onError}
          onToast={onToast}
        />
        <LedgerColumn
          title="Brandon & Stephanie paid"
          rows={brandonRows}
          empty="No Brandon & Stephanie receipts in this phase yet."
          onRefresh={onRefresh}
          onError={onError}
          onToast={onToast}
        />
      </div>
      {unassignedRows.length > 0 && (
        <div className="mt-6">
          <LedgerColumn
            title="Needs who-paid tag"
            rows={unassignedRows}
            empty=""
            onRefresh={onRefresh}
            onError={onError}
            onToast={onToast}
          />
        </div>
      )}
    </section>
  );
}

function LedgerColumn({
  title,
  rows,
  empty,
  onRefresh,
  onError,
  onToast,
}: {
  title: string;
  rows: Expense[];
  empty: string;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((expense) => (
            <li key={expense.id}>
              <ExpenseRow
                expense={expense}
                showPaidBy
                onRefresh={onRefresh}
                onError={onError}
                onToast={onToast}
                onDelete={async (id) => {
                  await api.deleteExpense(id);
                  onRefresh();
                  onToast('Expense removed', 'success');
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
