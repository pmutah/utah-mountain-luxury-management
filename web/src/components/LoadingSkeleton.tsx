export function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-slate-900 rounded-3xl border border-slate-800" />
        ))}
      </div>
      <div className="h-48 bg-slate-900 rounded-[40px] border border-slate-800" />
      <div className="h-64 bg-slate-900 rounded-[40px] border border-slate-800" />
    </div>
  );
}
