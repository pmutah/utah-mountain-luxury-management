/** Gold mountain mark used for the app icon and the guest loading screen. */
export function AppIcon({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="uml-icon-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6cd8c" />
          <stop offset="1" stopColor="#b8964c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#07110f" />
      <rect x="4.5" y="4.5" width="55" height="55" rx="10" fill="none" stroke="#d4b56a" strokeOpacity="0.45" />
      <path d="M9 45 L23 25 L30 34 L38 18 L55 45 Z" fill="url(#uml-icon-gold)" />
      <path d="M38 18 L33.2 27.6 L36 26 L38.4 28.4 L40.6 26.2 L43.2 27.2 Z" fill="#f4f1ea" />
      <path d="M23 25 L19.6 29.9 L21.8 29 L23.6 30.6 L25.6 28.6 Z" fill="#f4f1ea" opacity="0.85" />
      <path
        d="M9 51 C17 48.5 23 53.5 32 51 S47 48.5 55 51"
        fill="none"
        stroke="#d4b56a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
