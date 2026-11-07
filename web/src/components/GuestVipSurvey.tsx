import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { GuestPreferenceAnswers } from '../lib/api';
import { ARRIVAL_SLOTS, guestArrivalLine } from '../lib/arrival';
import { DEPARTURE_SLOTS, guestDepartureLine } from '../lib/departure';
import { preferenceActivities, preferenceAmenities } from '../lib/preference-choices';
import { vipStepIds, type VipStepId } from '../lib/survey-steps';

const OCCASIONS = [
  "New Year's",
  'Birthday',
  'Anniversary',
  'Family reunion',
  'Girls / guys weekend',
  'Ski trip',
  'Quiet getaway',
  'Other',
];

const ACTIVITIES = preferenceActivities('river');

const AMENITIES = preferenceAmenities('river');

const FOOD_VIBES = [
  'Comfort food',
  'Steakhouse',
  'Italian',
  'Mexican',
  'Something light',
  'Breakfast people',
  'Other',
];

const NA_TOAST = ["Martinelli's", 'NA sparkling', 'Mocktails', 'Other'];

const SETTINGS = [
  { id: 'outdoor', label: 'Outdoor', hint: 'River, trails, snow' },
  { id: 'indoor', label: 'Indoor', hint: 'Kitchen and fireplace' },
  { id: 'mix', label: 'A mix', hint: 'Days out, nights in' },
] as const;

function toggleValue(list: string[] | undefined, value: string): string[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

function Chip({
  label,
  selected,
  onClick,
  time,
  bot,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  time?: string;
  bot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-bot={bot ?? (time ? 'stay-pref-arrival-slot' : undefined)}
      data-time={time}
      className={`min-h-12 px-4 py-3 rounded-full text-[15px] font-medium border transition ${
        selected
          ? 'bg-[#f3e6c9] text-[#1a1410] border-[#d4b56a] shadow-[0_0_0_1px_#d4b56a]'
          : 'bg-white/8 text-[#f6f1e8] border-white/15 hover:border-white/35'
      }`}
    >
      {label}
    </button>
  );
}

function Gate({
  value,
  onChange,
  yes = 'Yes',
  no = 'No',
}: {
  value?: string;
  onChange: (next: 'yes' | 'no') => void;
  yes?: string;
  no?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(
        [
          ['yes', yes],
          ['no', no],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`min-h-16 rounded-2xl text-lg font-semibold border transition ${
            value === id
              ? 'bg-[#f3e6c9] text-[#1a1410] border-[#d4b56a]'
              : 'bg-white/8 text-[#f6f1e8] border-white/15'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const fieldClass =
  'w-full rounded-2xl border border-white/15 bg-white/8 px-4 py-4 text-[16px] text-[#f6f1e8] placeholder:text-white/35 outline-none focus:border-[#d4b56a]';

export function GuestVipSurvey({
  meta,
  answers,
  setAnswers,
  saving,
  error,
  done,
  guideHref,
  onSubmit,
}: {
  meta: { guestName: string; propertyName: string; checkIn: string; checkOut: string };
  answers: GuestPreferenceAnswers;
  setAnswers: Dispatch<SetStateAction<GuestPreferenceAnswers>>;
  saving: boolean;
  error: string | null;
  done: boolean;
  guideHref?: string;
  onSubmit: () => void;
}) {
  const [step, setStep] = useState<VipStepId>('welcome');
  const first = meta.guestName.split(' ')[0] || meta.guestName;

  const steps = useMemo(() => vipStepIds(answers.activities), [answers.activities]);

  const index = Math.max(0, steps.indexOf(step));
  const progress = Math.round((index / Math.max(steps.length - 1, 1)) * 100);
  const last = steps[steps.length - 1];

  function set<K extends keyof GuestPreferenceAnswers>(key: K, value: GuestPreferenceAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function go(delta: number) {
    const next = steps[index + delta];
    if (next) setStep(next);
  }

  if (done) {
    return (
      <SurveyShell>
        <div className="flex-1 flex flex-col justify-center text-center px-2 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#d4b56a]">
            Utah Mountain Luxury
          </p>
          <h1 className="guest-display text-5xl text-[#f6f1e8] mt-4">You are all set.</h1>
          <p className="mt-5 text-[#d7cfc3] leading-relaxed text-lg">
            We will use this to set The River House for {first}&rsquo;s group — fridge, toast,
            and the extras that make arrival feel easy.
          </p>
          {guideHref ? (
            <>
              <p className="mt-8 text-sm text-white/45">
                Your door code and Wi-Fi appear in your stay guide the day before {meta.checkIn}.
              </p>
              <a
                href={guideHref}
                className="mx-auto mt-5 inline-block rounded-full bg-[#d4b56a] px-5 py-2.5 text-sm font-semibold text-black"
              >
                Open your stay guide
              </a>
            </>
          ) : (
            <p className="mt-8 text-sm text-white/45">
              Door codes and the house guide arrive a few days before {meta.checkIn}.
            </p>
          )}
        </div>
      </SurveyShell>
    );
  }

  return (
    <SurveyShell>
      <header className="pt-2">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-[#d4b56a] font-semibold">
          <span>River House</span>
          <span>
            {index + 1} / {steps.length}
          </span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#d4b56a] to-[#f3e6c9] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center py-8 space-y-6">
        {step === 'welcome' && (
          <WelcomeStep first={first} meta={meta} />
        )}
        {step === 'occasion' && (
          <Step title="What are we celebrating?" hint="Tap every occasion that fits.">
            <div className="flex flex-wrap gap-2">
              {OCCASIONS.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={answers.occasions?.includes(opt) ?? false}
                  onClick={() => set('occasions', toggleValue(answers.occasions, opt))}
                />
              ))}
            </div>
            <textarea
              className={`${fieldClass} min-h-[96px]`}
              placeholder="Anything we should celebrate with you?"
              value={answers.occasionNote ?? ''}
              onChange={(e) => set('occasionNote', e.target.value)}
            />
          </Step>
        )}
        {step === 'party' && (
          <Step title="Who is coming?" hint="Names and ages help us set rooms and the welcome.">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-white/45">Adults</span>
                <input className={fieldClass} inputMode="numeric" value={answers.adults ?? ''} onChange={(e) => set('adults', e.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-white/45">Children</span>
                <input className={fieldClass} inputMode="numeric" value={answers.children ?? ''} onChange={(e) => set('children', e.target.value)} />
              </label>
            </div>
            <input
              className={fieldClass}
              placeholder="Ages of children, if any"
              value={answers.childAges ?? ''}
              onChange={(e) => set('childAges', e.target.value)}
            />
            <textarea
              className={`${fieldClass} min-h-[96px]`}
              placeholder="Names and roles — who is who"
              value={answers.partyNames ?? ''}
              onChange={(e) => set('partyNames', e.target.value)}
            />
          </Step>
        )}
        {step === 'arrive' && (
          <Step
            title="When will you arrive?"
            hint="Check-in is 4:00 PM. After 9:00 PM, quiet hours still apply. Choosing a time does not send this form, and it does not open the door code."
          >
            <div className="flex flex-wrap gap-2" data-bot="stay-pref-arrival">
              {ARRIVAL_SLOTS.map((slot) => (
                <Chip
                  key={slot}
                  label={slot}
                  time={slot}
                  selected={answers.arrivalWindow === slot}
                  onClick={() => set('arrivalWindow', answers.arrivalWindow === slot ? '' : slot)}
                />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-[#d7cfc3]" data-bot="stay-pref-arrival-note">
              {guestArrivalLine(answers.arrivalWindow) || 'No arrival time yet.'}
            </p>
          </Step>
        )}
        {step === 'leave' && (
          <Step
            title="When will you leave?"
            hint="Checkout is 11:00 AM. Leave at 2:00 PM is a request. Nothing is charged yet. Choosing a time does not send this form."
          >
            <div className="flex flex-wrap gap-2" data-bot="stay-pref-departure">
              {DEPARTURE_SLOTS.map((slot) => (
                <Chip
                  key={slot}
                  label={slot}
                  time={slot}
                  bot="stay-pref-departure-slot"
                  selected={answers.earlyLate === slot}
                  onClick={() => set('earlyLate', answers.earlyLate === slot ? '' : slot)}
                />
              ))}
            </div>
            <p className="text-sm leading-relaxed text-[#d7cfc3]" data-bot="stay-pref-departure-note">
              {guestDepartureLine(answers.earlyLate) || 'No departure time yet.'}
            </p>
          </Step>
        )}
        {step === 'setting' && (
          <Step title="How do you want the days to feel?">
            <div className="grid gap-3">
              {SETTINGS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => set('indoorOutdoor', opt.label)}
                  className={`min-h-20 rounded-2xl px-5 text-left border transition ${
                    answers.indoorOutdoor === opt.label
                      ? 'bg-[#f3e6c9] text-[#1a1410] border-[#d4b56a]'
                      : 'bg-white/8 text-[#f6f1e8] border-white/15'
                  }`}
                >
                  <p className="text-xl font-semibold">{opt.label}</p>
                  <p className={`text-sm ${answers.indoorOutdoor === opt.label ? 'text-[#5c4a2e]' : 'text-white/45'}`}>
                    {opt.hint}
                  </p>
                </button>
              ))}
            </div>
          </Step>
        )}
        {step === 'activities' && (
          <Step title="What are you hoping to do?" hint="Pick as many as you like.">
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={answers.activities?.includes(opt) ?? false}
                  onClick={() => set('activities', toggleValue(answers.activities, opt))}
                />
              ))}
            </div>
          </Step>
        )}
        {step === 'fishing' && (
          <Step title="Want a fishing guide intro?">
            <Gate value={answers.fishingGuide} onChange={(v) => set('fishingGuide', v)} />
          </Step>
        )}
        {step === 'bikes' && (
          <Step title="Bikes for the canyon">
            <div className="grid gap-3">
              {[
                { id: 'house', label: 'Use the house bikes' },
                { id: 'own', label: 'We are bringing our own' },
                { id: 'both', label: 'Both' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => set('bikeSource', opt.id)}
                  className={`min-h-16 rounded-2xl px-5 text-left text-lg font-semibold border ${
                    answers.bikeSource === opt.id
                      ? 'bg-[#f3e6c9] text-[#1a1410] border-[#d4b56a]'
                      : 'bg-white/8 text-[#f6f1e8] border-white/15'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Step>
        )}
        {step === 'skiing' && (
          <Step title="Skiing this stay">
            <input
              className={fieldClass}
              placeholder="Which resort — Sundance, Park City…"
              value={answers.skiResort ?? ''}
              onChange={(e) => set('skiResort', e.target.value)}
            />
            <p className="text-sm text-white/55">Anyone a first-timer?</p>
            <Gate value={answers.skiFirstTimer} onChange={(v) => set('skiFirstTimer', v)} />
          </Step>
        )}
        {step === 'amenities' && (
          <Step title="What should we lean into?" hint="These follow the published guide. Nothing is sent until the form is sent.">
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={answers.amenities?.includes(opt) ?? false}
                  onClick={() => set('amenities', toggleValue(answers.amenities, opt))}
                />
              ))}
            </div>
          </Step>
        )}
        {step === 'food' && (
          <Step title="Favorite food vibe">
            <div className="flex flex-wrap gap-2">
              {FOOD_VIBES.map((opt) => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={answers.foodVibe === opt}
                  onClick={() => set('foodVibe', opt)}
                />
              ))}
            </div>
            {answers.foodVibe === 'Other' && (
              <input
                className={fieldClass}
                placeholder="Tell us the vibe"
                value={answers.favoriteFood ?? ''}
                onChange={(e) => set('favoriteFood', e.target.value)}
              />
            )}
          </Step>
        )}
        {step === 'snacks' && (
          <Step title="Snacks and treats">
            <textarea
              className={`${fieldClass} min-h-[120px]`}
              placeholder="Chips, chocolate, fruit, something from home…"
              value={answers.snacks ?? ''}
              onChange={(e) => set('snacks', e.target.value)}
            />
          </Step>
        )}
        {step === 'drinks' && (
          <Step title="A toast when you arrive?">
            <Gate
              value={answers.drinksAlcohol}
              onChange={(v) => set('drinksAlcohol', v)}
              yes="We drink"
              no="We don't"
            />
            {answers.drinksAlcohol === 'yes' && (
              <textarea
                className={`${fieldClass} min-h-[96px]`}
                placeholder="Wine, beer, spirits — any favorites?"
                value={answers.alcoholPrefs ?? ''}
                onChange={(e) => set('alcoholPrefs', e.target.value)}
              />
            )}
            {answers.drinksAlcohol === 'no' && (
              <div className="space-y-3">
                <p className="text-sm text-white/55">A festive toast without alcohol</p>
                <div className="flex flex-wrap gap-2">
                  {NA_TOAST.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={answers.naDrinkPrefs === opt}
                      onClick={() => set('naDrinkPrefs', opt)}
                    />
                  ))}
                </div>
              </div>
            )}
          </Step>
        )}
        {step === 'allergies' && (
          <Step title="Allergies or dietary notes" hint="We will keep these off the welcome table.">
            <textarea
              className={`${fieldClass} min-h-[120px]`}
              placeholder="Nuts, gluten, none…"
              value={answers.allergies ?? ''}
              onChange={(e) => set('allergies', e.target.value)}
            />
          </Step>
        )}
        {step === 'else' && (
          <Step title="Anything else that would make the stay amazing?">
            <textarea
              className={`${fieldClass} min-h-[140px]`}
              placeholder="A scent, a playlist, a surprise for someone…"
              value={answers.anythingElse ?? ''}
              onChange={(e) => set('anythingElse', e.target.value)}
            />
          </Step>
        )}
        {error && <p className="text-[#f0b4a8] text-sm">{error}</p>}
      </div>

      <div className="sticky bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 flex gap-3">
        {step !== 'welcome' && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="min-h-14 px-5 rounded-2xl border border-white/15 text-[#f6f1e8] font-semibold"
          >
            Back
          </button>
        )}
        {step !== last ? (
          <button
            type="button"
            onClick={() => go(1)}
            className="flex-1 min-h-14 rounded-2xl bg-[#f3e6c9] text-[#1a1410] text-lg font-semibold"
            data-bot="survey-next"
          >
            {step === 'welcome' ? 'Begin' : 'Continue'}
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={onSubmit}
            className="flex-1 min-h-14 rounded-2xl bg-[#f3e6c9] text-[#1a1410] text-lg font-semibold disabled:opacity-50"
            data-bot="survey-submit"
          >
            {saving ? 'Sending…' : 'Send to the house'}
          </button>
        )}
      </div>
    </SurveyShell>
  );
}

function SurveyShell({ children }: { children: ReactNode }) {
  return (
    <div className="guest-survey min-h-screen text-[#f6f1e8]">
      <div className="guest-survey-hero absolute inset-0" />
      <div className="relative max-w-md mx-auto min-h-screen px-5 py-6 flex flex-col">
        {children}
      </div>
    </div>
  );
}

function WelcomeStep({
  first,
  meta,
}: {
  first: string;
  meta: { propertyName: string; checkIn: string; checkOut: string };
}) {
  return (
    <div className="space-y-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#d4b56a]">
        Utah Mountain Luxury
      </p>
      <h1 className="guest-display text-[42px] leading-[1.05] text-[#f6f1e8]">
        Welcome to
        <br />
        The River House,
        <br />
        {first}.
      </h1>
      <p className="text-lg text-[#d7cfc3] leading-relaxed">
        {meta.checkIn}–{meta.checkOut}. Two quiet minutes so we can set the fridge, a toast,
        and the house. Nothing is sent until the form is sent.
      </p>
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="guest-display text-[34px] leading-tight text-[#f6f1e8]">{title}</h2>
        {hint && <p className="mt-2 text-[#d7cfc3]">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
