import { useEffect, useMemo, useState } from 'react';
import { FileSignature, Library, Loader2, Mail, MessageSquare } from 'lucide-react';
import {
  api,
  type FormCategory,
  type FormTemplate,
  type VaultPropertyScope,
} from '../lib/api';

const inputClass =
  'w-full rounded-2xl bg-slate-950 border border-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500';

const PROPERTY_OPTIONS: Array<{ value: VaultPropertyScope; label: string }> = [
  { value: 'ranch', label: 'The Ranch House' },
  { value: 'lindon', label: 'The Lindon House' },
  { value: 'river', label: 'The River House' },
  { value: 'construction', label: 'River House construction' },
  { value: 'all', label: 'Portfolio' },
];

function emptyValues(template: FormTemplate): Record<string, string | number> {
  const values: Record<string, string | number> = { propertyId: template.defaultPropertyId };
  if (template.id === 'utah-progress-waiver' || template.id === 'utah-final-waiver') {
    values.customer = 'Utah Mountain Luxury Management';
  }
  return values;
}

export function FormLibrary({
  onCreated,
  onToast,
  canEmail,
  canText,
}: {
  onCreated: () => Promise<void>;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
  canEmail: boolean;
  canText: boolean;
}) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<Array<{ id: FormCategory; label: string }>>([]);
  const [category, setCategory] = useState<FormCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState('river-final-release');
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .getFormTemplates()
      .then((data) => {
        setTemplates(data.templates);
        setCategories(data.categories);
        const first = data.templates.find((t) => t.id === 'river-final-release') ?? data.templates[0];
        if (first) {
          setSelectedId(first.id);
          setValues(emptyValues(first));
        }
      })
      .catch((e) => onToast(e instanceof Error ? e.message : 'Could not load form library', 'error'))
      .finally(() => setLoading(false));
  }, [onToast]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const visible = useMemo(
    () => (category === 'all' ? templates : templates.filter((t) => t.category === category)),
    [templates, category],
  );

  const pick = (template: FormTemplate) => {
    setSelectedId(template.id);
    setValues(emptyValues(template));
  };

  const set = (key: string, value: string | number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const create = async (sendChannel: 'email' | 'sms' | 'none') => {
    if (!selected) return;
    if (sendChannel === 'email' && !String(values.email ?? '').trim()) {
      onToast('Add an email to send the signing link.', 'error');
      return;
    }
    if (sendChannel === 'sms' && !String(values.phone ?? '').trim()) {
      onToast('Add a phone number to text the signing link.', 'error');
      return;
    }
    if (sendChannel === 'email' && !canEmail) {
      onToast('Gmail is not connected, so the link cannot be emailed. Store the form, then copy the link from Packets.', 'error');
      return;
    }
    if (sendChannel === 'sms' && !canText) {
      onToast('SMS is not configured, so the link cannot be texted. Store the form, then copy the link from Packets.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.createFormFromTemplate(selected.id, { fields: values, sendChannel });
      if (result.link) await navigator.clipboard.writeText(result.link).catch(() => {});
      onToast(
        result.emailed
          ? `${selected.title} created and emailed`
          : result.texted
            ? `${selected.title} created and texted`
            : result.link
              ? `${selected.title} created — link copied`
              : `${selected.title} stored`,
        'success',
      );
      setValues(emptyValues(selected));
      await onCreated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not create form', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl">
        <p className="text-sm text-slate-500 font-bold">Loading form library…</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-cyan-800/40 shadow-xl space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
            E-sign library
          </p>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mt-1">
            <Library className="w-4 h-4" />
            Forms we send
          </h3>
          <p className="text-xs text-slate-500 mt-2 max-w-2xl">
            Every Utah Mountain Luxury packet you will want signed — lien waivers, contractor
            authorizations, vendor forms, guest charges, and owner approvals. Pick a form, fill it,
            then store, email, or text the link.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[40px] ${
              category === 'all' ? 'bg-cyan-700 text-white' : 'bg-slate-950 text-slate-500 border border-slate-800'
            }`}
          >
            All forms
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[40px] ${
                category === c.id ? 'bg-cyan-700 text-white' : 'bg-slate-950 text-slate-500 border border-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map((template) => {
            const active = template.id === selectedId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => pick(template)}
                className={`text-left rounded-3xl border p-4 min-h-[96px] ${
                  active
                    ? 'border-cyan-500 bg-cyan-950/40'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
                  {template.categoryLabel}
                </p>
                <p className="text-sm font-black text-white mt-1">{template.title}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {selected && (
        <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
              {selected.categoryLabel}
            </p>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mt-1">
              <FileSignature className="w-4 h-4" />
              {selected.title}
            </h3>
            <p className="text-xs text-slate-500 mt-2 max-w-2xl">{selected.description}</p>
          </div>

          {(!canEmail || !canText) && (
            <p className="text-xs text-amber-400/90 font-bold">
              {!canEmail ? 'Gmail is not connected — Store and email will tell you instead of doing nothing. ' : ''}
              {!canText ? 'SMS is not configured — Store and text will tell you instead of doing nothing.' : ''}
            </p>
          )}

          {selected.presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setValues({ ...emptyValues(selected), ...preset.values })}
                  className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[40px] bg-cyan-700 text-white"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setValues(emptyValues(selected))}
                className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[40px] bg-slate-950 text-slate-500 border border-slate-800"
              >
                Clear
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selected.fields.map((field) => {
              const span = field.span === 2 || field.type === 'textarea' ? 'sm:col-span-2' : '';
              const value = values[field.key] ?? '';
              return (
                <label key={field.key} className={`space-y-2 ${span}`}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {field.label}
                  </span>
                  {field.type === 'textarea' ? (
                    <textarea
                      className={`${inputClass} min-h-[96px]`}
                      value={String(value)}
                      placeholder={field.placeholder}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  ) : field.type === 'property' ? (
                    <select
                      className={inputClass}
                      value={String(value || selected.defaultPropertyId)}
                      disabled={selected.lockProperty}
                      onChange={(e) => set(field.key, e.target.value)}
                    >
                      {PROPERTY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'select' ? (
                    <select
                      className={inputClass}
                      value={String(value)}
                      onChange={(e) => set(field.key, e.target.value)}
                    >
                      <option value="">Select</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      type={field.type === 'number' ? 'number' : 'text'}
                      inputMode={
                        field.type === 'number' ? 'decimal' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : undefined
                      }
                      autoComplete={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : undefined}
                      min={field.type === 'number' ? 0 : undefined}
                      step={field.type === 'number' ? '0.01' : undefined}
                      value={field.type === 'number' ? value || '' : String(value)}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        set(
                          field.key,
                          field.type === 'number' ? Number(e.target.value) || 0 : e.target.value,
                        )
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 relative z-20 pb-28 sm:pb-0">
            <button
              type="button"
              data-bot="form-store"
              disabled={saving}
              onClick={() => void create('none')}
              className="px-6 py-3 rounded-2xl bg-slate-800 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Store form'}
            </button>
            <button
              type="button"
              data-bot="form-email"
              disabled={saving}
              onClick={() => void create('email')}
              className="px-6 py-3 rounded-2xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
            >
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              Store and email
            </button>
            <button
              type="button"
              data-bot="form-sms"
              disabled={saving}
              onClick={() => void create('sms')}
              className="px-6 py-3 rounded-2xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
            >
              <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
              Store and text
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
