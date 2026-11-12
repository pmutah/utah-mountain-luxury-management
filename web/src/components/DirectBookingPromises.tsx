import { Clock, Compass, ShieldCheck, Users } from 'lucide-react';
import { SLEEPS, SLEEPS_TOGETHER } from '../lib/house-stay';

export function DirectBookingPromises() {
  const pillars = [
    {
      id: 'no-fee',
      icon: ShieldCheck,
      title: 'Zero marketplace service fee',
      detail: 'Direct rates skip third-party guest markups, with transparent lodging, cleaning, and group split-pay math on every page.',
    },
    {
      id: 'hold',
      icon: Clock,
      title: '30-minute hold · No card upfront',
      detail: 'Sending a request holds your dates for 30 minutes while our local Utah team confirms your stay — nothing is charged on the form.',
    },
    {
      id: 'scale',
      icon: Users,
      title: `Suites for 4 up to ${SLEEPS_TOGETHER} together`,
      detail: `Reserve an individual River wing, a ${SLEEPS.lindon}-guest family home, a ${SLEEPS.ranch}-guest estate, a ${SLEEPS.river}-guest lodge, or River + Ranch together.`,
    },
    {
      id: 'concierge',
      icon: Compass,
      title: 'Live canyon telemetry & stay app',
      detail: 'Every stay includes live NWS snow, USGS Provo River cfs, interactive bedroom charts, 4-season itineraries, and our Nora stay guide.',
    },
  ] as const;

  return (
    <section
      className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-bot="direct-booking-promises"
      aria-label="Why book direct with Utah Mountain Luxury"
    >
      {pillars.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            className="uml-panel rounded-3xl p-4 sm:p-5 flex flex-col justify-between"
            data-bot={`direct-promise-${item.id}`}
          >
            <div>
              <div className="inline-flex rounded-full border border-[var(--uml-line)] p-2 text-[var(--uml-gold)]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2 className="font-display text-xl mt-2.5 leading-snug">{item.title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--uml-muted)]">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
