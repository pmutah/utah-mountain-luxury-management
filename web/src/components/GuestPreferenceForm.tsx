import { useEffect, useState } from 'react';
import { api, type GuestPreferenceAnswers } from '../lib/api';

const WHY_OPTIONS = [
  'Family / reunion',
  'Recreation / getaway',
  'Skiing or snowboarding',
  'Mountain biking',
  'The river',
  'Hiking',
  'A celebration',
  'Work retreat',
];

const AMENITY_OPTIONS = [
  'River',
  'Hot tub',
  'Sauna',
  'Fire pit',
  'Cooking together',
  'King-bed quiet',
  'Kids and bunks',
  'Great room',
  'Work from lodge',
  'Near Sundance',
];

const COFFEE_OPTIONS = [
  'Drip',
  'Espresso',
  'Latte',
  'Cappuccino',
  'Americano',
  'Cold brew',
  'Tea only',
  'Skip caffeine',
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 outline-none focus:border-stone-400';

export function GuestPreferenceForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<{
    guestName: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
  } | null>(null);
  const [answers, setAnswers] = useState<GuestPreferenceAnswers>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getPublicStayPreference(token)
      .then((data) => {
        setMeta({
          guestName: data.guestName,
          propertyName: data.propertyName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
        });
        if (data.answers) setAnswers(data.answers);
        if (data.completed) setDone(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'This link is not valid.'))
      .finally(() => setLoading(false));
  }, [token]);

  function set<K extends keyof GuestPreferenceAnswers>(key: K, value: GuestPreferenceAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function toggleList(key: 'tripWhy' | 'topAmenities', value: string, max?: number) {
    setAnswers((prev) => {
      const current = prev[key] ?? [];
      if (current.includes(value)) return { ...prev, [key]: current.filter((v) => v !== value) };
      const next = [...current, value];
      return { ...prev, [key]: max ? next.slice(0, max) : next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.submitPublicStayPreference(token, answers);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-600 flex items-center justify-center">
        Loading your stay…
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-700 flex items-center justify-center p-6">
        <p className="max-w-md text-center">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-800 flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
            Utah Mountain Luxury
          </p>
          <h1 className="text-3xl font-serif">Thank you</h1>
          <p className="text-stone-600 leading-relaxed">
            We’ll use this to set the house for your group. Door codes and the house guide arrive a few
            days before check-in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-xl mx-auto px-5 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500 mb-3">
          Utah Mountain Luxury
        </p>
        <h1 className="text-3xl font-serif mb-2">Curate your stay</h1>
        <p className="text-stone-600 mb-8 leading-relaxed">
          {meta?.propertyName} · {meta?.checkIn}–{meta?.checkOut}. A few favorites help us set a small
          welcome. We are not stocking the whole kitchen or cooking meals.
        </p>

        <form onSubmit={(e) => void submit(e)} className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-lg font-serif">Your group</h2>
            <Field label="Your name">
              <input className={inputClass} value={answers.leadName ?? meta?.guestName ?? ''} onChange={(e) => set('leadName', e.target.value)} />
            </Field>
            <Field label="Best cell on arrival day">
              <input className={inputClass} value={answers.cell ?? ''} onChange={(e) => set('cell', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Adults">
                <input className={inputClass} value={answers.adults ?? ''} onChange={(e) => set('adults', e.target.value)} />
              </Field>
              <Field label="Children">
                <input className={inputClass} value={answers.children ?? ''} onChange={(e) => set('children', e.target.value)} />
              </Field>
            </div>
            <Field label="Ages of children, if any">
              <input className={inputClass} value={answers.childAges ?? ''} onChange={(e) => set('childAges', e.target.value)} />
            </Field>
            <Field label="Celebrating anything?">
              <input className={inputClass} placeholder="Birthday, reunion, none" value={answers.celebration ?? ''} onChange={(e) => set('celebration', e.target.value)} />
            </Field>
            <Field label="Dogs? Count and weight">
              <input className={inputClass} placeholder="Dogs only, max 2, under 50 lb" value={answers.dogs ?? ''} onChange={(e) => set('dogs', e.target.value)} />
            </Field>
            <Field label="Stairs or accessibility notes">
              <textarea className={`${inputClass} min-h-[80px]`} value={answers.accessibility ?? ''} onChange={(e) => set('accessibility', e.target.value)} />
            </Field>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-serif">Arrival</h2>
            <Field label="Arrival window">
              <select className={inputClass} value={answers.arrivalWindow ?? ''} onChange={(e) => set('arrivalWindow', e.target.value)}>
                <option value="">Not sure yet</option>
                <option>4–6 PM</option>
                <option>6–8 PM</option>
                <option>8–10 PM</option>
                <option>After 10 PM</option>
              </select>
            </Field>
            <Field label="How you are arriving">
              <input className={inputClass} placeholder="Car, fly SLC then drive…" value={answers.arrivingHow ?? ''} onChange={(e) => set('arrivingHow', e.target.value)} />
            </Field>
            <Field label="Who else should get the door code">
              <input className={inputClass} placeholder="Up to 2 names and phones" value={answers.codeRecipients ?? ''} onChange={(e) => set('codeRecipients', e.target.value)} />
            </Field>
            <Field label="Send the code by">
              <select className={inputClass} value={answers.codeChannel ?? ''} onChange={(e) => set('codeChannel', e.target.value)}>
                <option value="">No preference</option>
                <option>VRBO message</option>
                <option>Text</option>
                <option>Email</option>
              </select>
            </Field>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-serif">Why you are coming</h2>
            <div className="flex flex-wrap gap-2">
              {WHY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleList('tripWhy', opt)}
                  className={`px-3 py-2 rounded-full text-sm border ${
                    answers.tripWhy?.includes(opt) ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <Field label="Days">
              <select className={inputClass} value={answers.insideOutside ?? ''} onChange={(e) => set('insideOutside', e.target.value)}>
                <option value="">Choose</option>
                <option>Mostly outside</option>
                <option>Mostly inside</option>
                <option>Mix — days out, nights in</option>
              </select>
            </Field>
            <Field label="Evenings">
              <select className={inputClass} value={answers.evenings ?? ''} onChange={(e) => set('evenings', e.target.value)}>
                <option value="">Choose</option>
                <option>Fire pit and hot tub</option>
                <option>Great room and fireplace</option>
                <option>Cook and linger</option>
                <option>Early to bed</option>
              </select>
            </Field>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Top 3 that matter this stay</p>
            <div className="flex flex-wrap gap-2">
              {AMENITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleList('topAmenities', opt, 3)}
                  className={`px-3 py-2 rounded-full text-sm border ${
                    answers.topAmenities?.includes(opt) ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-serif">Sleeping</h2>
            <Field label="Master King Suite">
              <input className={inputClass} placeholder="Names, or you assign" value={answers.masterSuite ?? ''} onChange={(e) => set('masterSuite', e.target.value)} />
            </Field>
            <Field label="Guest King Suite">
              <input className={inputClass} value={answers.guestSuite ?? ''} onChange={(e) => set('guestSuite', e.target.value)} />
            </Field>
            <Field label="Extra pillows — soft or firmer">
              <input className={inputClass} value={answers.extraPillows ?? ''} onChange={(e) => set('extraPillows', e.target.value)} />
            </Field>
            <Field label="Kids sleep">
              <input className={inputClass} placeholder="Bunks, loft, with parents" value={answers.kidsSleep ?? ''} onChange={(e) => set('kidsSleep', e.target.value)} />
            </Field>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-serif">Favorites</h2>
            <Field label="Allergies we must avoid">
              <input className={inputClass} value={answers.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} />
            </Field>
            <Field label="Do not leave out">
              <input className={inputClass} placeholder="Alcohol, pork, caffeine…" value={answers.doNotLeave ?? ''} onChange={(e) => set('doNotLeave', e.target.value)} />
            </Field>
            <Field label="Favorite food / comfort food">
              <input className={inputClass} value={answers.favoriteFood ?? ''} onChange={(e) => set('favoriteFood', e.target.value)} />
            </Field>
            <Field label="Favorite snack">
              <input className={inputClass} value={answers.favoriteSnack ?? ''} onChange={(e) => set('favoriteSnack', e.target.value)} />
            </Field>
            <Field label="Favorite non-alcoholic drink">
              <input className={inputClass} value={answers.favoriteNaDrink ?? ''} onChange={(e) => set('favoriteNaDrink', e.target.value)} />
            </Field>
            <Field label="Favorite alcoholic drink">
              <input className={inputClass} placeholder="Or “we don’t drink”" value={answers.favoriteAlcohol ?? ''} onChange={(e) => set('favoriteAlcohol', e.target.value)} />
            </Field>
            <Field label="Coffee">
              <select className={inputClass} value={answers.coffeeStyle ?? ''} onChange={(e) => set('coffeeStyle', e.target.value)}>
                <option value="">Choose</option>
                {COFFEE_OPTIONS.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </Field>
            {(answers.coffeeStyle === 'Latte' || answers.coffeeStyle === 'Cappuccino') && (
              <Field label="Milk">
                <select className={inputClass} value={answers.coffeeMilk ?? ''} onChange={(e) => set('coffeeMilk', e.target.value)}>
                  <option value="">Choose</option>
                  <option>Whole</option>
                  <option>2%</option>
                  <option>Oat</option>
                  <option>Almond</option>
                  <option>None</option>
                </select>
              </Field>
            )}
            <Field label="One item that would make you smile if it was already here">
              <input className={inputClass} value={answers.smileItem ?? ''} onChange={(e) => set('smileItem', e.target.value)} />
            </Field>
            <Field label="Anything else that would make this stay feel taken care of">
              <textarea className={`${inputClass} min-h-[90px]`} value={answers.anythingElse ?? ''} onChange={(e) => set('anythingElse', e.target.value)} />
            </Field>
          </section>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-stone-900 text-white py-4 font-semibold disabled:opacity-50"
          >
            {saving ? 'Sending…' : 'Send preferences'}
          </button>
        </form>
      </div>
    </div>
  );
}
