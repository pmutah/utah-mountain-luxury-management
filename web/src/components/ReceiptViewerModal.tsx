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
  const isPdf = contentType === 'application/pdf';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-black uppercase tracking-widest text-slate-300">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {isPdf ? (
          <iframe
            src={imageUrl}
            title={title}
            className="w-full h-[calc(90vh-4rem)] rounded-2xl border border-slate-700 bg-white"
          />
        ) : (
          <img
            src={imageUrl}
            alt={title}
            className="w-full max-h-[calc(90vh-4rem)] object-contain rounded-2xl border border-slate-700 bg-slate-900"
          />
        )}
      </div>
    </div>
  );
}
