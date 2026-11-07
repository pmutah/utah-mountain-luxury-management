import { reportPausedLine } from '../lib/report-paused';

export function ReportPausedNav({ onDocuments }: { onDocuments: () => void }) {
  return (
    <div className="space-y-6" data-bot="report-paused">
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" data-bot="report-pnl" className="uml-nav" aria-current="page">
          Management
        </button>
        <button type="button" data-bot="report-documents" className="uml-nav" onClick={onDocuments}>
          Documents
        </button>
      </div>
      <p className="text-sm text-[var(--uml-muted)]">{reportPausedLine()}</p>
    </div>
  );
}
