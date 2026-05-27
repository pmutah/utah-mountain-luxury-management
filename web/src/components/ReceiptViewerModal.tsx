import { X } from 'lucide-react';

export function ReceiptViewerModal({
  title,
  imageUrl,
  contentType,
  onClose,
}: {
  title: string;
  imageUrl: string;
  contentType?: string | null;
  onClose: () => void;
}) {
  const isPdf = contentType === 'application/pdf' || imageUrl.includes('application/pdf');

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/90">
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 truncate min-w-0">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white text-[10px] font-black uppercase"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
          Close
        </button>
      </div>

      <div className="flex-1 min-h-0 p-2 sm:p-3">
        {isPdf ? (
          <iframe
            src={imageUrl}
            title={title}
            className="w-full h-full min-h-[calc(100dvh-4.5rem)] rounded-lg sm:rounded-xl border border-slate-700 bg-white"
          />
        ) : (
          <div className="w-full h-full min-h-[calc(100dvh-4.5rem)] flex items-center justify-center overflow-auto">
            <img
              src={imageUrl}
              alt={title}
              className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg border border-slate-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}
