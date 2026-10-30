import { BrandMark } from './BrandMark';
import { GROUP_TRIP, GROUP_TRIP_HREF, parseHousePath, publicHouse, publicHouses, type PublicHouse } from '../lib/house-page';
export function HouseSite() {
  const which = parseHousePath(window.location.pathname);
  if (which === 'index') return <HouseIndex />;
  if (!which) {
    return (
      <div className="min-h-screen px-4 py-10 sm:px-8">
        <p className="text-sm">That house is not listed.</p>
        <a className="mt-4 inline-block underline" href="/houses" data-bot="houses-missing">
          All houses
        </a>
      </div>
    );
  }
  return <HousePage house={publicHouse(which)} />;
}

function HouseIndex() {
  const houses = publicHouses();
  return (
    <div className="min-h-screen px-4 py-10 sm:px-8" data-bot="houses-index">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="uml-kicker">Utah Mountain Luxury</p>
            <h1 className="font-display text-5xl">The houses</h1>
          </div>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-[var(--uml-muted)]">
          Three houses in Utah County. A quote is on the booking page. It does not charge a card or hold the dates.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {houses.map((house) => (
            <a key={house.id} href={house.pageHref} data-bot={`houses-card-${house.id}`} className="uml-panel block overflow-hidden rounded-3xl">
              {house.photo.src && <img src={house.photo.src} alt={house.name} className="h-44 w-full object-cover" />}
              <div className="px-5 py-4">
                <p className="uml-kicker">{house.id}</p>
                <p className="font-display text-3xl">{house.name.replace('The ', '')}</p>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">{house.title}</p>
              </div>
            </a>
          ))}
        </div>
        <section className="uml-panel mt-8 rounded-3xl px-6 py-5" data-bot="houses-group">
          <p className="uml-kicker">Plan a group trip</p>
          <p className="mt-2 max-w-2xl text-sm">{GROUP_TRIP}</p>
          <a className="mt-4 inline-block underline" href={GROUP_TRIP_HREF} data-bot="houses-group-quote">
            Quote both houses
          </a>
        </section>
      </div>
    </div>
  );
}

function HousePage({ house }: { house: PublicHouse }) {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-8" data-bot="house-page" data-house={house.id}>
      <script type="application/ld+json" data-bot="house-schema" dangerouslySetInnerHTML={{ __html: JSON.stringify(house.schema) }} />
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <a href="/houses" className="text-sm underline" data-bot="house-back">
            All houses
          </a>
          <BrandMark />
        </div>
        {house.photo.src && (
          <figure className="overflow-hidden rounded-3xl">
            <img src={house.photo.src} alt={house.name} className="h-72 w-full object-cover sm:h-96" data-bot="house-photo" />
            <figcaption className="px-1 pt-3 text-xs text-[var(--uml-muted)]">{house.photo.caption}</figcaption>
          </figure>
        )}
        <p className="uml-kicker mt-8">{house.id}</p>
        <h1 className="font-display text-5xl">{house.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">{house.title}</p>
        {house.opening && <p className="mt-2 text-sm">{house.opening}</p>}
        <p className="mt-4 text-sm">
          <a href={house.map} data-bot="house-map">
            {house.address}
          </a>
        </p>
        <ul className="mt-6 space-y-1 text-sm" data-bot="house-facts">
          {house.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {house.notes.length > 0 && (
          <div className="mt-6 space-y-3">
            {house.notes.map((note) => (
              <p key={note.title} className="text-sm">
                <span className="uml-kicker">{note.title}</span> {note.body}
              </p>
            ))}
          </div>
        )}
        <ul className="mt-6 space-y-2 text-sm" data-bot="house-rules">
          {house.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {house.nearby.map((group) => (
          <section key={group.kind} className="mt-8">
            <p className="uml-kicker">{group.label}</p>
            <ul className="mt-2 space-y-2 text-sm">
              {group.places.map((place) => (
                <li key={place.name}>
                  <a href={place.href}>{place.name}</a>
                  {place.site ? ` · ${place.site}` : ''} — {place.note}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-8 text-sm">{house.emergency}</p>
        <a
          href={house.quoteHref}
          data-bot="house-quote"
          className="mt-6 inline-block rounded-full bg-[var(--uml-gold)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold-ink)]"
        >
          See the dates
        </a>
        <p className="mt-3 text-xs text-[var(--uml-muted)]">The booking page quotes the stay. It does not charge a card or hold the dates.</p>
      </div>
    </div>
  );
}
