import { useEffect, useState, type ReactNode } from 'react';
import { api, type GuidePlace, type HouseGuide } from '../lib/api';

type HouseId = 'ranch' | 'lindon' | 'river';

const HOUSES: Array<{ id: HouseId; label: string }> = [
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
];

const KINDS: GuidePlace['kind'][] = ['ski', 'food', 'outdoors', 'family', 'rentals', 'essentials'];

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

export function GuestAppEditor({ onToast }: { onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void }) {
  const [open, setOpen] = useState(false);
  const [house, setHouse] = useState<HouseId>('river');
  const [guides, setGuides] = useState<Record<HouseId, HouseGuide> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || guides) return;
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
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <span>
          <span className="block text-white font-black">Guest app</span>
          <span className="block text-xs text-slate-500">
            Codes, Wi-Fi, house guide, and area picks guests see at their stay link.
          </span>
        </span>
        <span className="text-xs font-black uppercase text-cyan-400">{open ? 'Close' : 'Edit'}</span>
      </button>

      {open && !guide && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {open && guide && (
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
