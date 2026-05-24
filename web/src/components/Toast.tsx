import type { Toast as ToastItem } from '../hooks/useToast';

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,24rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-2xl text-sm font-bold shadow-xl border ${
            t.kind === 'success'
              ? 'bg-emerald-950 border-emerald-700 text-emerald-200'
              : t.kind === 'error'
                ? 'bg-red-950 border-red-700 text-red-200'
                : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
