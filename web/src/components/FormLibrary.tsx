import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileSignature, FileUp, Library, Loader2, Mail, MessageSquare } from 'lucide-react';
import {
  api,
  type FormCategory,
  type FormTemplate,
  type VaultDocument,
  type VaultPropertyScope,
} from '../lib/api';
import { looksLikeInvoiceText, parseInvoiceTextLocal } from '../lib/invoice-import';
import { fileFromClipboard, isChatPasteTarget, prepareReceiptFile } from '../lib/receipt-image';

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

function requiredMissing(template: FormTemplate, values: Record<string, string | number>): string[] {
  return template.fields
    .filter((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      if (field.type === 'number') return !Number.isFinite(Number(value)) || Number(value) === 0;
      return !String(value ?? '').trim();
    })
    .map((field) => field.label);
}

export function FormLibrary({
  onCreated,
  onStored,
  onToast,
  canEmail,
  canText,
}: {
  onCreated: () => Promise<void>;
  onStored?: () => Promise<void>;
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
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [gmailQuery, setGmailQuery] = useState('invoice newer_than:180d');
  const [gmailHits, setGmailHits] = useState<Array<{ id: string; subject: string; from: string; date: string }>>([]);
  const [storedDoc, setStoredDoc] = useState<VaultDocument | null>(null);
  const [storedSnapshot, setStoredSnapshot] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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

  const resetImport = () => {
    setImportText('');
    setImportName('');
    setGmailHits([]);
    setStoredDoc(null);
    setStoredSnapshot('');
  };

  const pick = (template: FormTemplate) => {
    setSelectedId(template.id);
    setValues(emptyValues(template));
    resetImport();
  };

  const set = (key: string, value: string | number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const snapshotOf = (next: Record<string, string | number>) => JSON.stringify(next);
  const fieldsMatchStored = storedDoc != null && storedSnapshot === snapshotOf(values);

  const applyImported = async (
    fields: Record<string, string | number | undefined>,
    missing: string[],
  ) => {
    if (!selected) return;
    const cleaned = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value != null && value !== ''),
    ) as Record<string, string | number>;
    const next = { ...emptyValues(selected), ...cleaned };
    if (selected.lockProperty) next.propertyId = selected.defaultPropertyId;
    setValues(next);
    const stillMissing = missing.length ? missing : requiredMissing(selected, next);
    if (stillMissing.length) {
      onToast(`Filled what we could — add ${stillMissing.join(', ')}, then store or send.`, 'info');
      return;
    }
    setSaving(true);
    try {
      const result = await api.createFormFromTemplate(selected.id, {
        fields: next,
        sendChannel: 'none',
      });
      setStoredDoc(result.document);
      setStoredSnapshot(snapshotOf(next));
      if (result.link) await navigator.clipboard.writeText(result.link).catch(() => {});
      await onStored?.();
      onToast(`${selected.title} is stored and ready to email or text.`, 'success');
    } catch (e) {
      onToast(
        e instanceof Error
          ? `${e.message} Fields are filled — review and store.`
          : 'Fields are filled — review and store.',
        'info',
      );
    } finally {
      setSaving(false);
    }
  };

  const importFrom = async (
    body: Parameters<typeof api.parseInvoiceForForm>[0],
    sourceLabel: string,
  ) => {
    if (!selected) return;
    setImporting(true);
    try {
      const result = await api.parseInvoiceForForm({ ...body, templateId: selected.id });
      if (result.messages) {
        setGmailHits(result.messages);
        onToast(
          result.messages.length ? `Found ${result.messages.length} emails` : 'No matching emails',
          result.messages.length ? 'info' : 'error',
        );
        return;
      }
      if (!result.fields) throw new Error('Could not read contractor details from that invoice.');
      setImportName(sourceLabel);
      await applyImported(result.fields, result.missing ?? []);
    } catch (e) {
      const local =
        body.type === 'text' && body.text ? parseInvoiceTextLocal(body.text) : null;
      if (local) {
        setImportName(sourceLabel);
        await applyImported(local, []);
        return;
      }
      onToast(e instanceof Error ? e.message : 'Could not read that invoice', 'error');
    } finally {
      setImporting(false);
    }
  };

  const attachFile = async (file: File | undefined) => {
    if (!file || !selected) return;
    const isEmail = file.name.toLowerCase().endsWith('.eml') || file.type === 'message/rfc822';
    try {
      if (isEmail) {
        const text = await file.text();
        setImportText(text);
        await importFrom({ type: 'text', text }, file.name);
        return;
      }
      const prepared = await prepareReceiptFile(file);
      setImportName(prepared.name);
      await importFrom(
        { type: 'image', imageBase64: prepared.base64, mimeType: prepared.mimeType },
        prepared.name,
      );
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not read that file', 'error');
    }
  };

  const handleClipboard = (data: DataTransfer | null, target: EventTarget | null) => {
    if (!selected || selected.category !== 'lien') return false;
    if (isChatPasteTarget(target)) return false;
    const file = fileFromClipboard(data);
    if (file) {
      void attachFile(file);
      return true;
    }
    const pasted = data?.getData('text/plain') ?? '';
    if (!pasted.trim()) return false;
    const el = target instanceof Element ? target : null;
    const field = el?.closest('input, textarea, select') as HTMLElement | null;
    const pasteBox = field?.getAttribute('data-bot') === 'form-import-text';
    if (pasteBox || !field || looksLikeInvoiceText(pasted)) {
      setImportText(pasted);
      void importFrom({ type: 'text', text: pasted }, 'Pasted email');
      return true;
    }
    return false;
  };

  const handleClipboardRef = useRef(handleClipboard);
  useEffect(() => {
    handleClipboardRef.current = handleClipboard;
  });

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (handleClipboardRef.current(e.clipboardData, e.target)) e.preventDefault();
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, []);

  const sendStored = async (channel: 'email' | 'sms') => {
    if (!storedDoc || !selected) return;
    if (channel === 'email' && !String(values.email ?? '').trim()) {
      onToast('Add an email to send the signing link.', 'error');
      return;
    }
    if (channel === 'sms' && !String(values.phone ?? '').trim()) {
      onToast('Add a phone number to text the signing link.', 'error');
      return;
    }
    if (channel === 'email' && !canEmail) {
      onToast('Gmail is not connected, so the link cannot be emailed. Copy it from Packets.', 'error');
      return;
    }
    if (channel === 'sms' && !canText) {
      onToast('SMS is not configured, so the link cannot be texted. Copy it from Packets.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.sendVaultEsign(storedDoc.id, {
        signerName: String(values[selected.signerField] ?? storedDoc.signerName ?? ''),
        signerEmail: String(values.email ?? ''),
        signerPhone: String(values.phone ?? ''),
        channel,
      });
      if (result.link) await navigator.clipboard.writeText(result.link).catch(() => {});
      onToast(
        result.emailed
          ? `${selected.title} emailed`
          : result.texted
            ? `${selected.title} texted`
            : 'Signing link copied',
        'success',
      );
      setValues(emptyValues(selected));
      resetImport();
      await onCreated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not send form', 'error');
    } finally {
      setSaving(false);
    }
  };

  const create = async (sendChannel: 'email' | 'sms' | 'none') => {
    if (!selected) return;
    if (fieldsMatchStored && sendChannel !== 'none') {
      await sendStored(sendChannel);
      return;
    }
    if (fieldsMatchStored && sendChannel === 'none') {
      onToast('Packet is already stored — email or text it, or open Packets.', 'info');
      return;
    }
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
      resetImport();
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

          {selected.category === 'lien' && (
            <div
              data-bot="form-import"
              className="rounded-3xl border border-dashed border-violet-700/60 bg-violet-950/20 p-4 space-y-3"
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">
                  Import invoice or email
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Drop a contractor invoice (PDF or photo), paste the email, or pull it from Gmail.
                  We fill the waiver and store the packet so it is ready to send.
                </p>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    void attachFile(file);
                    return;
                  }
                  const dropped = e.dataTransfer.getData('text/plain');
                  if (dropped.trim()) {
                    setImportText(dropped);
                    void importFrom({ type: 'text', text: dropped }, 'Dropped email');
                  }
                }}
                className="flex flex-wrap items-center gap-2"
              >
                {importing ? (
                  <div className="flex items-center gap-2 text-violet-200 py-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <p className="text-xs font-black uppercase tracking-widest">Reading invoice…</p>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      data-bot="form-import-file"
                      onClick={() => fileRef.current?.click()}
                      className="px-4 py-2 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px] inline-flex items-center gap-2"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      Invoice PDF / photo
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="px-4 py-2 rounded-2xl bg-violet-700 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px] inline-flex items-center gap-2"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Camera
                    </button>
                    {importName && (
                      <p className="text-[10px] font-bold text-violet-200 uppercase tracking-wider">
                        {importName}
                      </p>
                    )}
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*,.eml,message/rfc822"
                className="hidden"
                onChange={(e) => {
                  void attachFile(e.target.files?.[0]);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void attachFile(e.target.files?.[0]);
                  if (cameraRef.current) cameraRef.current.value = '';
                }}
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  data-bot="form-import-text"
                  className={`${inputClass} min-h-[88px]`}
                  value={importText}
                  placeholder="Paste the contractor email or invoice text"
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button
                  type="button"
                  data-bot="form-import-read"
                  disabled={!importText.trim() || importing}
                  onClick={() => void importFrom({ type: 'text', text: importText }, 'Pasted email')}
                  className="self-end px-4 py-2 rounded-2xl bg-violet-700 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px]"
                >
                  Read email
                </button>
              </div>
              {canEmail && (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      data-bot="form-import-gmail"
                      className={inputClass}
                      value={gmailQuery}
                      placeholder="Gmail search — invoice from JM"
                      onChange={(e) => setGmailQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() =>
                        void importFrom({ type: 'gmail-search', query: gmailQuery }, 'Gmail')
                      }
                      className="px-4 py-2 rounded-2xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px] inline-flex items-center gap-2"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Find in Gmail
                    </button>
                  </div>
                  {gmailHits.length > 0 && (
                    <div className="space-y-1">
                      {gmailHits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          disabled={importing}
                          onClick={() => void importFrom({ type: 'gmail', messageId: hit.id }, hit.subject)}
                          className="w-full text-left rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2 hover:border-violet-600"
                        >
                          <p className="text-xs font-bold text-white truncate">{hit.subject}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {hit.from}
                            {hit.date ? ` · ${hit.date}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {storedDoc && (
                <p className="text-xs font-bold text-emerald-300">
                  Packet stored: {storedDoc.title}. Review the fields, then email or text.
                </p>
              )}
            </div>
          )}

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
                  onClick={() => {
                    setStoredDoc(null);
                    setStoredSnapshot('');
                    setValues({ ...emptyValues(selected), ...preset.values });
                  }}
                  className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[40px] bg-cyan-700 text-white"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setValues(emptyValues(selected));
                  resetImport();
                }}
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
              disabled={saving || importing}
              onClick={() => void create('none')}
              className="px-6 py-3 rounded-2xl bg-slate-800 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Store form'}
            </button>
            <button
              type="button"
              data-bot="form-email"
              disabled={saving || importing}
              onClick={() => void create('email')}
              className="px-6 py-3 rounded-2xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
            >
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              Store and email
            </button>
            <button
              type="button"
              data-bot="form-sms"
              disabled={saving || importing}
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
