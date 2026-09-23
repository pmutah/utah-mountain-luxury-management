export function BrandMark({ className = 'w-11 h-11' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="1" y="1" width="62" height="62" rx="8" fill="none" stroke="var(--uml-gold)" strokeWidth="1" />
      <path
        d="M6 44 L16 30 L24 38 L34 18 L44 32 L52 24 L58 34"
        fill="none"
        stroke="var(--uml-gold)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M6 48 H58" stroke="var(--uml-gold)" strokeWidth="0.6" opacity="0.7" />
    </svg>
  );
}
