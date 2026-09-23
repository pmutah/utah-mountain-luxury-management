import { useState } from 'react';
import type { PortfolioData } from '../lib/api';
import { downloadOwnerLetter } from '../lib/owner-letter';

export function OwnerLetterButton({
  data,
  onToast,
}: {
  data: PortfolioData;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-bot="owner-letter"
      disabled={busy}
      className="uml-gold-btn rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] disabled:opacity-50"
      onClick={() => {
        setBusy(true);
        downloadOwnerLetter(data)
          .then(() => onToast('The Letter downloaded', 'success'))
          .catch((e: unknown) => onToast(e instanceof Error ? e.message : 'Could not compose the letter', 'error'))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? 'Composing…' : 'The Letter'}
    </button>
  );
}
