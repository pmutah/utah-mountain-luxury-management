import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, formatCurrency, PROPERTIES } from '../lib/api';

export function ExtraCleaningInput({
  propertyId,
  month,
  value,
  onSaved,
  onError,
}: {
  propertyId: string;
  month: string;
  value: number | undefined;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const key = `${propertyId}-${month}`;
  const [local, setLocal] = useState(value !== undefined && value > 0 ? String(value) : '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal(value !== undefined && value > 0 ? String(value) : '');
  }, [value, key]);

  const persist = (raw: string) => {
    setSaving(true);
    api
      .updateExtraCleaning({ [key]: raw })
      .then(() => onSaved())
      .catch(() => onError('Could not save extra cleaning fee'))
      .finally(() => setSaving(false));
  };

  const onChange = (raw: string) => {
    setLocal(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(raw), 600);
  };

  return (
    <div className="p-6 bg-slate-950/50 rounded-[24px] border border-slate-800/50 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-500" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Add extra cleaning fees
          </p>
        </div>
        <div className="flex items-center bg-slate-900 rounded-xl px-4 py-2 border border-slate-700">
          <span className="text-slate-500 mr-2 font-bold">$</span>
          <input
            type="number"
            step="0.01"
            value={local}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0"
            className="bg-transparent border-none text-sm font-black text-white w-24 p-0 focus:ring-0 outline-none"
            aria-label="Extra cleaning fee"
          />
          {saving && <span className="text-[9px] text-blue-500 font-bold ml-2">Saving…</span>}
        </div>
      </div>
      <p className="text-[9px] text-slate-600 font-bold italic">
        Base fee of {formatCurrency(PROPERTIES[propertyId].cleaningFee)}/stay is already included.
      </p>
    </div>
  );
}
