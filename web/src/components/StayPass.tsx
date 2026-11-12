import { qrSvg } from '../lib/qr-svg';

export function StayPass({
  token,
  house,
  address,
  checkIn,
  checkOut,
  checkInTime,
  checkOutTime,
  parking,
  emergency,
}: {
  token: string;
  house: string;
  address: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  parking: string;
  emergency: string;
}) {
  const url = `${window.location.origin}/stay/${encodeURIComponent(token)}`;
  let svg = '';
  try {
    svg = qrSvg(url);
  } catch {
    svg = '';
  }
  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="stay-pass">
      <p className="uml-kicker">Offline card</p>
      <h2 className="font-display text-3xl">{house}</h2>
      <p className="mt-2 text-sm">{address}</p>
      <p className="mt-1 text-sm">
        {checkIn} {checkInTime} → {checkOut} {checkOutTime}
      </p>
      <p className="mt-2 text-sm">{parking}</p>
      <p className="mt-2 text-sm">{emergency}</p>
      <p className="mt-2 text-xs text-[var(--uml-muted)]">Door codes stay off this card. Scan the code when you are ready for the guide.</p>
      {svg ? <div className="mt-3 max-w-[220px] bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="mt-3 text-sm">This link is too long to draw as a code.</p>}
      <button type="button" className="uml-nav mt-3" data-print-hide onClick={() => window.print()}>
        Print stay pass
      </button>
    </section>
  );
}
