import { Copy, Download } from 'lucide-react';
import type { PortfolioData } from '../lib/api';
import { copySummary, downloadCsv } from '../lib/export';

export function ExportMenu({
  data,
  onToast,
}: {
  data: PortfolioData;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          downloadCsv(data);
          onToast('CSV downloaded', 'success');
        }}
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
      >
        <Download className="w-4 h-4" />
        CSV
      </button>
      <button
        type="button"
        onClick={() =>
          void copySummary(data).then((ok) =>
            onToast(ok ? 'Summary copied' : 'Copy failed', ok ? 'success' : 'error'),
          )
        }
        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
      >
        <Copy className="w-4 h-4" />
        Copy summary
      </button>
    </div>
  );
}
