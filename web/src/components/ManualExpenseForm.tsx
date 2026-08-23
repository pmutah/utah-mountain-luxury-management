import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, formatCurrency, PROPERTIES, type RentalPropertyId } from '../lib/api';
import { PAID_BY_LABELS, tracksPartnerContributions, type PaidBy } from '../lib/paid-by';

export function ManualExpenseForm({
  propertyId,
  month,
  onSaved,
  onError,
  onToast,
}: {
  propertyId: RentalPropertyId;
  month: string;
  onSaved: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<PaidBy>('brandon');
  const [saving, setSaving] = useState(false);
  const showPaidBy = tracksPartnerContributions(propertyId);
  const accent = propertyId === 'river' ? 'cyan' : propertyId === 'ranch' ? 'blue' : 'emerald';

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
      await api.addExpense({
        propertyId,
        month,
        category: 'Other',
        amount: value,
        note: what,
        paidBy: showPaidBy ? paidBy : undefined,
      });
      setDescription('');
      setAmount('');
      onSaved();
      onToast(`Added ${formatCurrency(value)} to ${PROPERTIES[propertyId].name}`, 'success');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`p-6 rounded-[24px] border flex flex-col gap-4 ${
        propertyId === 'river'
          ? 'bg-cyan-950/40 border-cyan-800/60'
          : 'bg-slate-950/50 border-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <Plus className={`w-4 h-4 ${propertyId === 'river' ? 'text-cyan-400' : 'text-emerald-500'}`} />
        <div>
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Add a manual expense
          </p>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Type what it was and the amount for {PROPERTIES[propertyId].name}.
            {showPaidBy ? ' Mark who paid so the 50/50 stays even.' : ''}
          </p>
        </div>
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Master bedroom furniture, Costco towels, plumber"
          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-sm font-bold text-white placeholder:text-slate-600"
        />
      </label>

      <div className={`grid gap-3 ${showPaidBy ? 'sm:grid-cols-2' : ''}`}>
        <label className="text-[10px] font-bold text-slate-500 uppercase">
          Amount
          <div className="mt-1 flex items-center bg-slate-900 rounded-xl px-3 py-2 border border-slate-700">
            <span className="text-slate-500 mr-2 font-bold">$</span>
            <input
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

        {showPaidBy && (
          <fieldset>
            <legend className="text-[10px] font-bold text-slate-500 uppercase">Who paid</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['brandon', 'todd'] as const).map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => setPaidBy(who)}
                  className={`px-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
                    paidBy === who
                      ? who === 'brandon'
                        ? accent === 'cyan'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-blue-600 text-white'
                        : 'bg-slate-600 text-white'
                      : 'bg-slate-900 text-slate-500 border border-slate-800'
                  }`}
                >
                  {PAID_BY_LABELS[who]}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className={`self-end px-6 py-3 rounded-xl text-xs font-black uppercase min-h-[44px] disabled:opacity-40 ${
          propertyId === 'river' ? 'bg-cyan-600 text-white' : 'bg-emerald-600 text-white'
        }`}
      >
        {saving ? 'Saving…' : 'Add expense'}
      </button>
      </form>
    </div>
  );
}
