import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, formatMonthLabel } from '../lib/months';

export function MonthPicker({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <button
        type="button"
        onClick={() => onChange(addMonths(month, -1))}
        className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors shrink-0"
        aria-label="Previous month"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <input
        type="month"
        value={month}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-2xl font-black focus:ring-2 focus:ring-blue-600 outline-none flex-1 sm:flex-none min-w-0 cursor-pointer text-center"
        aria-label="Select month"
        data-bot="month"
      />
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 hover:text-white transition-colors shrink-0"
        aria-label="Next month"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
      <span className="hidden lg:inline text-[10px] font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">
        {formatMonthLabel(month)}
      </span>
    </div>
  );
}
