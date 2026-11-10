import { useEffect, useState, type ReactNode } from 'react';
import { api, type GuidePlace, type HouseGuide } from '../lib/api';
import { guestEditorLockLine } from '../lib/guest-list';
import { enableHold, guideReadiness, switchLine } from '../lib/guest-app-ready';

type HouseId = 'ranch' | 'lindon' | 'river';

const HOUSES: Array<{ id: HouseId; label: string }> = [
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
];

const KINDS: GuidePlace['kind'][] = ['ski', 'food', 'outdoors', 'family', 'rentals', 'essentials'];

/**
 * The three Riverhouse parts, in the order a host thinks of them.
 *
 * Names match `RIVER_UNIT_DETAIL` so the editor and the guest page cannot describe the same part differently.
 */
const PART_DOORS: Array<{ id: 'main-lodge' | 'recreation-wing' | 'garage-suite'; name: string }> = [
  { id: 'main-lodge', name: 'Main Lodge' },
  { id: 'recreation-wing', name: 'Recreation Wing' },
  { id: 'garage-suite', name: 'Garage Suite' },
];

/**
 * One line saying how many part codes are set.
 *
 * A host needs to know at a glance whether the three parts can actually be sold tonight. Saying "2 of 3" is the fact that
 * decides it: the third part's guest would be told to call.
 */
function partDoorSummary(codes: Partial<Record<'main-lodge' | 'recreation-wing' | 'garage-suite', string>> | undefined): string {
  const set = PART_DOORS.filter((part) => (codes?.[part.id] ?? '').trim().length > 0);
  if (set.length === 0) return 'No part has its own code, so a part guest is told to call rather than given an entrance code.';
  if (set.length === PART_DOORS.length) {
    return 'All three parts have their own code. A whole-house booking still uses the single house code above.';
  }
  const missing = PART_DOORS.filter((part) => !(codes?.[part.id] ?? '').trim().length).map((part) => part.name);
  return `${set.length} of ${PART_DOORS.length} parts have a code. ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} left blank, so ${missing.length === 1 ? 'that guest is' : 'those guests are'} told to call.`;
}

const input =
  'w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function GuestAppEditor({
  onToast,
  locked = false,
}: {
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [house, setHouse] = useState<HouseId>('river');
  const [guides, setGuides] = useState<Record<HouseId, HouseGuide> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (locked || !open || guides) return;
    api
      .getGuestGuides()
      .then((data) => setGuides(data.guides))
      .catch((e: unknown) => onToast(e instanceof Error ? e.message : 'Could not load the guest app', 'error'));
  }, [open, guides, onToast]);

  const guide = guides?.[house];

  function patch(next: Partial<HouseGuide>) {
    setGuides((prev) => (prev ? { ...prev, [house]: { ...prev[house], ...next } } : prev));
  }

  async function save() {
    if (!guide) return;
    setSaving(true);
    try {
      const { updatedAt: _ignored, ...body } = guide;
      void _ignored;
      const result = await api.saveGuestGuide(house, body);
      setGuides((prev) => (prev ? { ...prev, [house]: result.guide } : prev));
      onToast(`${HOUSES.find((h) => h.id === house)?.label} guest app saved`, 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    if (!guide) return;
    const label = HOUSES.find((h) => h.id === house)?.label;
    const enabled = !guide.enabled;
    // Turning a house on asks the same readiness check the route runs, so the switch cannot send a
    // guest to a nearly blank page.
    if (enabled) {
      const hold = enableHold(guide);
      if (hold) {
        onToast(hold, 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const result = await api.saveGuestGuide(house, { enabled });
      patch({ enabled: result.guide.enabled });
      onToast(`${label} guest app is ${enabled ? 'on' : 'off'}`, 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not switch the guest app', 'error');
    } finally {
      setSaving(false);
    }
  }

  const text = (key: keyof HouseGuide, label: string, placeholder = '') => (
    <Field label={label}>
      <input
        className={input}
        placeholder={placeholder}
        value={String(guide?.[key] ?? '')}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<HouseGuide>)}
      />
    </Field>
  );

  const area = (key: keyof HouseGuide, label: string, rows = 3) => (
    <Field label={label}>
      <textarea
        className={input}
        rows={rows}
        value={String(guide?.[key] ?? '')}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<HouseGuide>)}
      />
    </Field>
  );

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guest-app-editor">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        data-bot="guest-app-edit"
        aria-disabled={locked}
        onClick={() => {
          if (!locked) setOpen(!open);
        }}
      >
        <span>
          <span className="block text-white font-black">Guest app</span>
          <span className="block text-xs text-slate-500" data-bot="guest-app-lock">
            {locked
              ? guestEditorLockLine()
              : 'Codes, Wi-Fi, house guide, and area picks guests see at their stay link.'}
          </span>
        </span>
        <span className="text-xs font-black uppercase text-cyan-400">{open && !locked ? 'Close' : 'Edit'}</span>
      </button>

      {open && !locked && !guide && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {open && !locked && guide && (
        <div className="mt-5 space-y-5">
          <div className="flex gap-2">
            {HOUSES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="uml-nav"
                aria-current={house === item.id ? 'page' : undefined}
                onClick={() => setHouse(item.id)}
              >
                {item.label}
                <span className={guides?.[item.id].enabled ? 'ml-1.5 text-emerald-400' : 'ml-1.5 text-slate-500'}>
                  {guides?.[item.id].enabled ? 'On' : 'Off'}
                </span>
              </button>
            ))}
          </div>

          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
              guide.enabled ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 bg-slate-950'
            }`}
          >
            <div>
              <p className={`text-sm font-black ${guide.enabled ? 'text-emerald-300' : 'text-slate-200'}`}>
                {HOUSES.find((h) => h.id === house)?.label} guest app is {guide.enabled ? 'ON' : 'OFF'}
              </p>
              <p className="text-xs text-slate-500">
                {guide.enabled
                  ? 'Guests open the full stay app from their link.'
                  : 'Guests only see the preference form. Use Preview app on a stay to keep building.'}
              </p>
              <p
                className={`mt-1 text-xs ${guideReadiness(guide).ready ? 'text-slate-400' : 'text-amber-400'}`}
                data-bot="guest-app-ready"
                data-ready={guideReadiness(guide).ready ? 'yes' : 'no'}
              >
                {switchLine(guide, guide.enabled)}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={guide.enabled}
              data-bot="guest-app-toggle"
              disabled={saving}
              onClick={() => void toggle()}
              className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest disabled:opacity-40 ${
                guide.enabled ? 'bg-slate-800 text-slate-200' : 'bg-emerald-700 text-white'
              }`}
            >
              {guide.enabled ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <p className="text-xs text-amber-300">
              Shown to the guest from the day before check-in until noon on checkout day. Never on a public page.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {text('doorCode', 'Door code')}
              {text('doorNotes', 'Door notes', 'Front door keypad, press the lock button to lock')}
              {text('wifiName', 'Wi-Fi network')}
              {text('wifiPassword', 'Wi-Fi password')}
            </div>
            {/*
              A code per part, because the River House is sold in parts.

              `part-door-codes.ts` has decided what a part guest sees since the split, and both the guest and cleaner routes
              pass `guide.partDoorCodes` into it - but nothing in this app could write that field, so every field was empty
              and every part guest was told to call for a code. The owner's instruction was three separate codes with
              same-night part combinations allowed; this is the missing half.

              Only shown for the River House: the other two are not sold in parts, so three extra boxes there would be
              decoration. Each is deliberately blank-able - clearing a code puts that part back to "call us", which is the
              correct state when a lock is rekeyed.
            */}
            {house === 'river' && (
              <div className="space-y-2 rounded-2xl border border-amber-500/20 p-3" data-bot="part-door-codes">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Door code per part</p>
                <p className="text-xs text-amber-200/70">
                  A guest who books one part sees only that part&apos;s code. If a part has no code it is left blank and the
                  guest is told to call — the house code is never used instead, because it opens every part.
                </p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {PART_DOORS.map(({ id, name }) => (
                    <Field key={id} label={name}>
                      <input
                        className={input}
                        data-bot={`part-door-${id}`}
                        placeholder="Not set"
                        value={guide?.partDoorCodes?.[id] ?? ''}
                        onChange={(e) => {
                          /*
                           * An emptied field removes the part rather than storing an empty string, so `part-door-codes.ts`
                           * reads it as "no code" instead of a code that is the empty string.
                           */
                          const next = { ...(guide?.partDoorCodes ?? {}) };
                          const value = e.target.value.trim();
                          if (value) next[id] = value;
                          else delete next[id];
                          patch({ partDoorCodes: next });
                        }}
                      />
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-amber-200/70" data-bot="part-door-summary">
                  {partDoorSummary(guide?.partDoorCodes)}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              House controls (Home Assistant)
            </p>
            <p className="text-xs text-slate-500">
              Guests can ask Nora to run these. They see the name only. The entity id stays here, for example light.living_room.
            </p>
            {(guide.controls ?? []).map((control, index) => (
              <div key={index} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className={input}
                  placeholder="Living room lights"
                  value={control.name}
                  onChange={(e) =>
                    patch({
                      controls: (guide.controls ?? []).map((item, i) =>
                        i === index ? { ...item, name: e.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  className={input}
                  placeholder="light.living_room"
                  value={control.entityId}
                  onChange={(e) =>
                    patch({
                      controls: (guide.controls ?? []).map((item, i) =>
                        i === index ? { ...item, entityId: e.target.value.trim() } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="text-xs text-red-300"
                  onClick={() => patch({ controls: (guide.controls ?? []).filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-black uppercase"
              onClick={() =>
                patch({ controls: [...(guide.controls ?? []), { name: '', entityId: '', kind: 'light' }] })
              }
            >
              Add light
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {text('headline', 'Headline')}
            {text('address', 'Address')}
            {text('checkInTime', 'Check-in time')}
            {text('checkOutTime', 'Checkout time')}
            {text('contactPhone', 'Guest contact phone')}
            {text('contactEmail', 'Guest contact email')}
          </div>
          {area('arrival', 'Getting there')}
          {area('parking', 'Parking', 2)}
          {area('checkout', 'Checkout steps (one per line)', 5)}
          {area('houseRules', 'House rules')}
          {area('emergency', 'Emergency', 2)}

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">House guide sections</p>
            {guide.sections.map((section, index) => (
              <div key={index} className="rounded-2xl border border-slate-800 p-3 space-y-2">
                <input
                  className={input}
                  placeholder="Hot tub"
                  value={section.title}
                  onChange={(e) =>
                    patch({ sections: guide.sections.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)) })
                  }
                />
                <textarea
                  className={input}
                  rows={3}
                  placeholder="How to use it. One step per line becomes a numbered list."
                  value={section.body}
                  onChange={(e) =>
                    patch({ sections: guide.sections.map((s, i) => (i === index ? { ...s, body: e.target.value } : s)) })
                  }
                />
                <button
                  type="button"
                  className="text-xs text-red-300"
                  onClick={() => patch({ sections: guide.sections.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-black uppercase"
              onClick={() => patch({ sections: [...guide.sections, { title: '', body: '' }] })}
            >
              Add section
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              How-to videos (YouTube, Vimeo, or a direct .mp4 link)
            </p>
            {guide.videos.map((video, index) => (
              <div key={index} className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
                <input
                  className={input}
                  placeholder="Hot tub"
                  value={video.title}
                  onChange={(e) =>
                    patch({ videos: guide.videos.map((v, i) => (i === index ? { ...v, title: e.target.value } : v)) })
                  }
                />
                <input
                  className={input}
                  placeholder="https://"
                  value={video.url}
                  onChange={(e) =>
                    patch({ videos: guide.videos.map((v, i) => (i === index ? { ...v, url: e.target.value } : v)) })
                  }
                />
                <button
                  type="button"
                  className="text-xs text-red-300"
                  onClick={() => patch({ videos: guide.videos.filter((_, i) => i !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-black uppercase"
              onClick={() => patch({ videos: [...guide.videos, { title: '', url: '' }] })}
            >
              Add video
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Area picks</p>
            {guide.places.map((place, index) => {
              const set = (next: Partial<GuidePlace>) =>
                patch({ places: guide.places.map((p, i) => (i === index ? { ...p, ...next } : p)) });
              return (
                <div key={index} className="rounded-2xl border border-slate-800 p-3 space-y-2">
                  <div className="grid sm:grid-cols-[2fr_1fr_1fr] gap-2">
                    <input className={input} placeholder="Name" value={place.name} onChange={(e) => set({ name: e.target.value })} />
                    <input className={input} placeholder="Area" value={place.area ?? ''} onChange={(e) => set({ area: e.target.value })} />
                    <select
                      className={input}
                      value={place.kind}
                      onChange={(e) => set({ kind: e.target.value as GuidePlace['kind'] })}
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input className={input} placeholder="Why go" value={place.note} onChange={(e) => set({ note: e.target.value })} />
                  <div className="flex gap-2">
                    <input
                      className={input}
                      placeholder="Website (optional, a map link is used otherwise)"
                      value={place.url ?? ''}
                      onChange={(e) => set({ url: e.target.value || undefined })}
                    />
                    <button
                      type="button"
                      className="text-xs text-red-300"
                      onClick={() => patch({ places: guide.places.filter((_, i) => i !== index) })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-black uppercase"
              onClick={() => patch({ places: [...guide.places, { name: '', kind: 'food', note: '' }] })}
            >
              Add place
            </button>
          </div>

          <button
            type="button"
            data-bot="guest-app-save"
            disabled={saving}
            onClick={() => void save()}
            className="px-5 py-2.5 rounded-2xl bg-cyan-700 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Save ${HOUSES.find((h) => h.id === house)?.label} guest app`}
          </button>
        </div>
      )}
    </section>
  );
}
