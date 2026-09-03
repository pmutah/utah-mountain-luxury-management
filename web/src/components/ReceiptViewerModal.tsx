import { ExternalLink, FileText, X } from 'lucide-react';
import { isMobileDevice, isPdfContentType } from '../lib/device';

export function ReceiptViewerModal({
  title,
  imageUrl,
  openUrl,
  contentType,
  onClose,
}: {
  title: string;
  /** Blob URL or same-origin URL for embed/img */
  imageUrl: string;
  /** Direct API URL — required for reliable mobile PDF open */
  openUrl?: string;
  contentType?: string | null;
  onClose: () => void;
}) {
  const isPdf = isPdfContentType(contentType) || imageUrl.includes('application/pdf');
  const mobile = isMobileDevice();
  const pdfHref = openUrl ?? imageUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 h-dvh overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/90 safe-area-inset-top">
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

      <div className="flex-1 min-h-0 p-3 flex flex-col overflow-hidden">
        {isPdf && mobile ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center min-h-[50dvh]">
            <FileText className="w-16 h-16 text-blue-400" aria-hidden />
            <p className="text-sm text-slate-300 max-w-sm">
              Your phone can&apos;t preview PDFs inside this page. Open the bill in a new tab to
              view it.
            </p>
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full max-w-sm px-6 py-4 min-h-[52px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black uppercase tracking-wider"
            >
              <ExternalLink className="w-5 h-5" />
              Open PDF
            </a>
            <p className="text-[10px] text-slate-500">
              If nothing happens, allow pop-ups for this site or long-press the button and choose
              Open in new tab.
            </p>
          </div>
        ) : isPdf ? (
          <iframe
            src={`${pdfHref}${pdfHref.includes('#') ? '' : '#view=FitH'}`}
            title={title}
            className="flex-1 w-full h-full min-h-0 rounded-xl border border-slate-700 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center overflow-auto min-h-[50dvh]">
            <img
              src={imageUrl}
              alt={title}
              className="max-w-full max-h-[85dvh] w-auto h-auto object-contain rounded-xl border border-slate-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}
