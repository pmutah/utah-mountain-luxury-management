import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <Icon className="w-10 h-10 text-slate-600 mx-auto mb-4" />
      <p className="text-sm font-black text-slate-400 uppercase tracking-widest">{title}</p>
      {description && (
        <p className="text-xs text-slate-600 font-bold mt-2 max-w-xs mx-auto">{description}</p>
      )}
    </div>
  );
}
