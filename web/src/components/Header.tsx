import { Home } from 'lucide-react';
import { MonthPicker } from './MonthPicker';

export function Header({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (m: string) => void;
}) {
  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-6 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3 rounded-2xl shadow-lg shadow-blue-900/30">
            <Home className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Portfolio</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">
              Wilhite Property Management
            </p>
          </div>
        </div>
        <MonthPicker month={month} onChange={onMonthChange} />
      </div>
    </header>
  );
}
