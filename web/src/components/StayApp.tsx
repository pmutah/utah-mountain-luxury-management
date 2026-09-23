import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type GuidePlace, type StayGuide } from '../lib/api';
import { GuestPreferenceForm } from './GuestPreferenceForm';

type Tab = 'stay' | 'house' | 'area' | 'help';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'stay', label: 'Your stay' },
  { id: 'house', label: 'The house' },
  { id: 'area', label: 'The area' },
  { id: 'help', label: 'Help' },
];

const PLACE_KINDS: Array<{ id: GuidePlace['kind'] | 'all'; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'ski', label: 'Ski' },
  { id: 'food', label: 'Eat' },
  { id: 'outdoors', label: 'Outdoors' },
  { id: 'family', label: 'Family' },
  { id: 'rentals', label: 'Rentals' },
  { id: 'essentials', label: 'Good to know' },
];

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function mapsLink(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 ${className}`}>{children}</section>;
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]">{children}</p>;
}

function CopyValue({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest text-white/45">{label}</p>
        <p className={`${big ? 'guest-display text-5xl tracking-wider' : 'text-lg'} break-all text-[#f6f1e8]`}>{value}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Lines({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return <p className="leading-relaxed text-[#d7cfc3]">{text}</p>;
  return (
    <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed text-[#d7cfc3]">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
  );
}

function isDirectVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

export function StayApp({ token }: { token: string }) {
  const preview = new URLSearchParams(window.location.search).get('preview') === '1';
  const [data, setData] = useState<StayGuide | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stay');
  const [kind, setKind] = useState<GuidePlace['kind'] | 'all'>('all');

  useEffect(() => {
    api
      .getStayGuide(token, preview)
      .then((result) => {
        if (result.guestName === undefined) setOff(true);
        else setData(result);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'This link is not valid.'));
  }, [token, preview]);

  useEffect(() => {
    if (!data) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previous = link?.href;
    if (link) link.href = `/api/stay-guide/${encodeURIComponent(token)}/manifest`;
    document.title = 'Your stay · Utah Mountain Luxury';
    return () => {
      if (link && previous) link.href = previous;
    };
  }, [token, data]);

  const kinds = useMemo(
    () => PLACE_KINDS.filter((item) => item.id === 'all' || data?.guide.places.some((place) => place.kind === item.id)),
    [data],
  );

  if (off) return <GuestPreferenceForm token={token} />;
  if (error) {
    return (
      <div className="guest-survey flex min-h-screen items-center justify-center p-6 text-[#d7cfc3]">
        <p className="max-w-sm text-center">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="guest-survey flex min-h-screen items-center justify-center text-[#d7cfc3]">Opening your stay…</div>
    );
  }

  const { guide, access } = data;
  const first = data.guestName.split(' ')[0] || data.guestName;
  const house = data.propertyName.replace(/^The /, '');
  const places = guide.places.filter((place) => kind === 'all' || place.kind === kind);
  const phone = guide.contactPhone.replace(/[^\d+]/g, '');

  return (
    <div className="guest-survey min-h-screen pb-24 text-[#f6f1e8]" data-bot="stay-app">
      <header className="relative h-64 overflow-hidden">
        <img src={`/houses/${data.propertyId}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-[#07110f]" />
        <div className="relative mx-auto flex h-full max-w-md flex-col justify-end px-5 pb-5">
          <Kicker>Utah Mountain Luxury</Kicker>
          <h1 className="guest-display mt-2 text-4xl">Welcome, {first}</h1>
          <p className="mt-1 text-sm text-white/70">
            {house} · {longDate(data.checkIn)} – {longDate(data.checkOut)}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 pt-4">
        {access.preview && (
          <p className="rounded-2xl bg-[#d4b56a]/15 px-4 py-2 text-sm text-[#d4b56a]">
            {data.enabled
              ? `Owner preview. Codes are showing early. The guest sees them on ${longDate(access.opensOn)}.`
              : `Owner preview. The ${house} guest app is off, so guests only see the preference form. Turn it on in Guests → Guest app.`}
          </p>
        )}

        {tab === 'stay' && (
          <>
            {!data.preferencesDone && access.phase === 'before' && (
              <a href={`/stay/${encodeURIComponent(token)}/preferences`} className="block">
                <Card className="border-[#d4b56a]/40">
                  <Kicker>Before you arrive</Kicker>
                  <p className="mt-2 text-lg">Tell us about your group</p>
                  <p className="mt-1 text-sm text-white/60">Rooms, groceries, celebrations. We set the house around it.</p>
                </Card>
              </a>
            )}

            <Card>
              <Kicker>Getting in</Kicker>
              {access.unlocked ? (
                <div className="mt-4 space-y-5">
                  {access.doorCode ? (
                    <CopyValue label="Door code" value={access.doorCode} big />
                  ) : (
                    <p className="text-[#d7cfc3]">Your door code is on its way. Text us if it is not here by check-in.</p>
                  )}
                  {access.doorNotes && <p className="text-sm text-white/60">{access.doorNotes}</p>}
                  {access.wifiName && <CopyValue label="Wi-Fi network" value={access.wifiName} />}
                  {access.wifiPassword && <CopyValue label="Wi-Fi password" value={access.wifiPassword} />}
                </div>
              ) : access.phase === 'after' ? (
                <p className="mt-3 text-[#d7cfc3]">Thank you for staying with us. We hope to see you again.</p>
              ) : (
                <p className="mt-3 text-[#d7cfc3]">
                  Your door code and Wi-Fi appear here on {longDate(access.opensOn)}, the day before check-in.
                </p>
              )}
            </Card>

            <Card>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/45">Check-in</p>
                  <p className="text-lg">{guide.checkInTime}</p>
                  <p className="text-sm text-white/55">{longDate(data.checkIn)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/45">Checkout</p>
                  <p className="text-lg">{guide.checkOutTime}</p>
                  <p className="text-sm text-white/55">{longDate(data.checkOut)}</p>
                </div>
              </div>
              <a
                href={mapsLink(guide.address)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block rounded-2xl bg-[#d4b56a] px-4 py-3 text-center text-sm font-semibold text-black"
              >
                Directions to {guide.address}
              </a>
              {guide.arrival && <p className="mt-4 text-sm leading-relaxed text-[#d7cfc3]">{guide.arrival}</p>}
              {guide.parking && <p className="mt-2 text-sm leading-relaxed text-white/60">{guide.parking}</p>}
            </Card>

            <Card>
              <Kicker>Before you leave</Kicker>
              <div className="mt-3">
                <Lines text={guide.checkout} />
              </div>
            </Card>
          </>
        )}

        {tab === 'house' && (
          <>
            <Card>
              <Kicker>{house}</Kicker>
              <p className="guest-display mt-2 text-3xl">{guide.headline}</p>
            </Card>
            {guide.videos.length > 0 && (
              <Card>
                <Kicker>How-to videos</Kicker>
                <div className="mt-3 space-y-4">
                  {guide.videos.map((video) =>
                    isDirectVideo(video.url) ? (
                      <div key={video.url}>
                        <p className="mb-2 text-sm">{video.title}</p>
                        <video src={video.url} controls playsInline preload="metadata" className="w-full rounded-2xl" />
                      </div>
                    ) : (
                      <a key={video.url} href={video.url} target="_blank" rel="noreferrer" className="block text-[#d4b56a] underline">
                        {video.title}
                      </a>
                    ),
                  )}
                </div>
              </Card>
            )}
            {guide.sections.map((section) => (
              <Card key={section.title}>
                <p className="text-lg">{section.title}</p>
                <div className="mt-2 text-sm">
                  <Lines text={section.body} />
                </div>
              </Card>
            ))}
            <Card>
              <Kicker>House rules</Kicker>
              <p className="mt-2 text-sm leading-relaxed text-[#d7cfc3]">{guide.houseRules}</p>
            </Card>
          </>
        )}

        {tab === 'area' && (
          <>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {kinds.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                    kind === item.id ? 'bg-[#d4b56a] text-black' : 'border border-white/15 text-white/70'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {places.map((place) => (
              <Card key={`${place.kind}-${place.name}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg">{place.name}</p>
                    {place.area && <p className="text-xs uppercase tracking-widest text-white/45">{place.area}</p>}
                  </div>
                  <a
                    href={place.url ?? mapsLink(`${place.name} ${place.area ?? ''} Utah`)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70"
                  >
                    {place.url ? 'Website' : 'Map'}
                  </a>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#d7cfc3]">{place.note}</p>
              </Card>
            ))}
            <p className="px-1 text-xs text-white/40">Hours change, especially Sundays. Check before you drive.</p>
          </>
        )}

        {tab === 'help' && (
          <>
            <Card>
              <Kicker>Reach us</Kicker>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <a href={`sms:${phone}`} className="rounded-2xl bg-[#d4b56a] px-4 py-3 text-center text-sm font-semibold text-black">
                  Text us
                </a>
                <a href={`tel:${phone}`} className="rounded-2xl border border-white/15 px-4 py-3 text-center text-sm">
                  Call {guide.contactPhone}
                </a>
              </div>
              <a href={`mailto:${guide.contactEmail}`} className="mt-3 block text-center text-sm text-white/60 underline">
                {guide.contactEmail}
              </a>
            </Card>
            <Card>
              <Kicker>Emergency</Kicker>
              <p className="mt-2 text-sm leading-relaxed text-[#d7cfc3]">{guide.emergency}</p>
            </Card>
            <Card>
              <Kicker>Keep this on your phone</Kicker>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                iPhone: tap Share, then Add to Home Screen. Android: tap the menu, then Install app. It opens right back to
                your stay.
              </p>
            </Card>
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#07110f]/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-bot={`stay-tab-${item.id}`}
              onClick={() => {
                setTab(item.id);
                window.scrollTo({ top: 0 });
              }}
              className={`py-4 text-xs uppercase tracking-widest ${tab === item.id ? 'text-[#d4b56a]' : 'text-white/50'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
