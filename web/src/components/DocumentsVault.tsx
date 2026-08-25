import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  FileSignature,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  MessageSquare,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  api,
  type SignerRole,
  type VaultDocument,
  type VaultFolder,
  type VaultPropertyScope,
} from '../lib/api';
import { isPdfContentType } from '../lib/device';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { SignaturePad } from './SignaturePad';
import { FormLibrary } from './FormLibrary';

const FOLDERS: Array<{ id: VaultFolder | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'esign', label: 'E-sign' },
  { id: 'contractor', label: 'Contractor releases' },
  { id: 'important', label: 'Important' },
];

const PROPERTIES: Array<{ id: VaultPropertyScope; label: string }> = [
  { id: 'all', label: 'Portfolio' },
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
  { id: 'construction', label: 'Construction' },
];

const ROLES: Array<{ id: SignerRole; label: string }> = [
  { id: 'contractor', label: 'Contractor' },
  { id: 'vendor', label: 'Vendor' },
  { id: 'owner', label: 'Owner' },
  { id: 'staff', label: 'Staff' },
  { id: 'other', label: 'Other' },
];

const MAX_MB = 15;

const inputClass =
  'w-full rounded-2xl bg-slate-950 border border-slate-800 px-4 py-3 text-sm text-white outline-none focus:border-violet-500';

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x4000, bytes.length)));
  }
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  return { base64: btoa(binary), mimeType };
}

function statusLabel(status: VaultDocument['status']): string {
  if (status === 'pending') return 'Awaiting signature';
  if (status === 'completed') return 'Signed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Stored';
}

function statusClass(status: VaultDocument['status']): string {
  if (status === 'pending') return 'text-amber-400';
  if (status === 'completed') return 'text-emerald-400';
  if (status === 'cancelled') return 'text-slate-500';
  return 'text-slate-400';
}

function matchesFolder(doc: VaultDocument, folder: VaultFolder | 'all'): boolean {
  if (folder === 'all') return true;
  if (folder === 'esign') {
    return doc.folder === 'esign' || doc.status === 'pending' || doc.status === 'completed';
  }
  return doc.folder === folder;
}

function publicLink(token: string): string {
  return `${window.location.origin}/esign/${encodeURIComponent(token)}`;
}

export function DocumentsVault({
  onToast,
}: {
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [vaultView, setVaultView] = useState<'library' | 'packets'>('library');
  const [folder, setFolder] = useState<VaultFolder | 'all'>('all');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState('');
  const [uploadFolder, setUploadFolder] = useState<VaultFolder>('contractor');
  const [propertyId, setPropertyId] = useState<VaultPropertyScope>('all');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [signerRole, setSignerRole] = useState<SignerRole>('contractor');
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null }>({
    connected: false,
    email: null,
  });
  const [sms, setSms] = useState<{ configured: boolean; from: string | null }>({
    configured: false,
    from: null,
  });
  const [sendDoc, setSendDoc] = useState<VaultDocument | null>(null);
  const [sendName, setSendName] = useState('');
  const [sendEmail, setSendEmail] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [viewer, setViewer] = useState<{ title: string; url: string; contentType: string } | null>(
    null,
  );
  const [signDoc, setSignDoc] = useState<VaultDocument | null>(null);
  const [signName, setSignName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getVaultDocuments();
      setDocuments(data.documents);
      if (data.gmail) setGmail(data.gmail);
      if (data.sms) setSms(data.sms);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => documents.filter((d) => matchesFolder(d, folder)),
    [documents, folder],
  );

  const chooseFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      onToast(`File exceeds the ${MAX_MB} MB limit.`, 'error');
      return;
    }
    setPendingFile(file);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const upload = async () => {
    if (!pendingFile) {
      onToast('Choose a PDF or image first.', 'error');
      return;
    }
    setUploading(true);
    try {
      const { base64, mimeType } = await fileToBase64(pendingFile);
      await api.uploadVaultDocument({
        fileBase64: base64,
        mimeType,
        fileName: pendingFile.name,
        title: title.trim() || pendingFile.name,
        folder: uploadFolder,
        notes: notes.trim() || undefined,
        propertyId,
        signerName: signerName.trim() || undefined,
        signerEmail: signerEmail.trim() || undefined,
        signerPhone: signerPhone.trim() || undefined,
        signerRole,
      });
      setPendingFile(null);
      setTitle('');
      setNotes('');
      onToast('Document stored', 'success');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const openSend = (doc: VaultDocument) => {
    setSendDoc(doc);
    setSendName(doc.signerName || signerName);
    setSendEmail(doc.signerEmail || doc.lienRelease?.email || '');
    setSendPhone(doc.signerPhone || doc.lienRelease?.phone || '');
  };

  const sendLink = async (channel: 'email' | 'sms' | 'none') => {
    if (!sendDoc) return;
    if (!sendName.trim()) {
      onToast('Add the signer name first.', 'error');
      return;
    }
    if (channel === 'email' && !sendEmail.trim()) {
      onToast('Add an email to send the signing link.', 'error');
      return;
    }
    if (channel === 'sms' && !sendPhone.trim()) {
      onToast('Add a phone number to text the signing link.', 'error');
      return;
    }
    if (channel === 'email' && !gmail.connected) {
      onToast('Gmail is not connected, so the link cannot be emailed. Use Copy only, then send the link yourself.', 'error');
      return;
    }
    if (channel === 'sms' && !sms.configured) {
      onToast('SMS is not configured, so the link cannot be texted. Use Copy only, then send the link yourself.', 'error');
      return;
    }
    setSending(true);
    try {
      const result = await api.sendVaultEsign(sendDoc.id, {
        signerName: sendName.trim(),
        signerEmail: sendEmail.trim() || undefined,
        signerPhone: sendPhone.trim() || undefined,
        channel,
      });
      if (result.link) await navigator.clipboard.writeText(result.link).catch(() => {});
      onToast(
        result.emailed
          ? 'Signing link emailed and copied'
          : result.texted
            ? 'Signing link texted and copied'
            : 'Signing link copied',
        'success',
      );
      setSendDoc(null);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not send signing link', 'error');
    } finally {
      setSending(false);
    }
  };

  const signNow = async () => {
    if (!signDoc) return;
    if (!signName.trim()) {
      onToast('Type the signer name.', 'error');
      return;
    }
    if (!signature) {
      onToast('Draw a signature first.', 'error');
      return;
    }
    if (!consent) {
      onToast('Consent is required.', 'error');
      return;
    }
    setSigning(true);
    try {
      await api.signVaultDocumentNow(signDoc.id, {
        signerName: signName.trim(),
        signatureDataUrl: signature,
        consentAccepted: true,
      });
      onToast('Document signed and stored', 'success');
      setSignDoc(null);
      setSignature(null);
      setConsent(false);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Sign failed', 'error');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-6 sm:p-8 border-b border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            E-sign vault
          </p>
          <h2 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
            <FolderOpen className="w-6 h-6 text-violet-400" />
            Documents
          </h2>
          <p className="text-xs text-slate-500 mt-2 max-w-xl">
            The library is every form Utah Mountain Luxury will send for signature. Fill one, then
            email or text the link. Signed packets stay here with a certificate of completion. You
            can still upload a one-off PDF if it is not in the library yet.
          </p>
          <div className="mt-4 text-xs text-slate-400 space-y-1">
            <p>
              Gmail:{' '}
              {gmail.connected
                ? gmail.email
                : 'not connected — connect utahmountainluxury@gmail.com to email signing links'}
            </p>
            <p>
              SMS:{' '}
              {sms.configured
                ? `Twilio ${sms.from}`
                : 'not configured — add Twilio SID/token/From in Pages env to text signing links'}
            </p>
          </div>
        </div>
        <div className="p-6 sm:p-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVaultView('library')}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
              vaultView === 'library'
                ? 'bg-violet-600 text-white shadow-xl'
                : 'bg-slate-950 text-slate-500 border border-slate-800'
            }`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setVaultView('packets')}
            className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
              vaultView === 'packets'
                ? 'bg-violet-600 text-white shadow-xl'
                : 'bg-slate-950 text-slate-500 border border-slate-800'
            }`}
          >
            Packets
          </button>
          {vaultView === 'packets' &&
            FOLDERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFolder(f.id)}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] ${
                  folder === f.id
                    ? 'bg-cyan-700 text-white shadow-xl'
                    : 'bg-slate-950 text-slate-500 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
        </div>
      </section>

      {vaultView === 'library' && (
        <FormLibrary
          onCreated={async () => {
            await load();
            setVaultView('packets');
            setFolder('all');
          }}
          onToast={onToast}
          canEmail={gmail.connected}
          canText={sms.configured}
        />
      )}

      {vaultView === 'packets' && (
      <section className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Add a document
        </h3>
        <div
          className={`rounded-3xl border-2 border-dashed px-5 py-8 text-center ${
            dragOver ? 'border-violet-500 bg-violet-950/30' : 'border-slate-800 bg-slate-950/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            chooseFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          <p className="text-sm text-slate-300 font-bold">
            {pendingFile ? pendingFile.name : 'Drop a PDF or image, or browse'}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-slate-800 text-white min-h-[44px]"
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Title
            </span>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Folder
            </span>
            <select
              className={inputClass}
              value={uploadFolder}
              onChange={(e) => setUploadFolder(e.target.value as VaultFolder)}
            >
              <option value="contractor">Contractor releases</option>
              <option value="esign">E-sign</option>
              <option value="important">Important documents</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Property
            </span>
            <select
              className={inputClass}
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value as VaultPropertyScope)}
            >
              {PROPERTIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Signer role
            </span>
            <select
              className={inputClass}
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value as SignerRole)}
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Signer name
            </span>
            <input
              className={inputClass}
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Who needs to sign"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Signer email
            </span>
            <input
              className={inputClass}
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="Optional — for emailing the link"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Signer phone
            </span>
            <input
              className={inputClass}
              type="tel"
              value={signerPhone}
              onChange={(e) => setSignerPhone(e.target.value)}
              placeholder="Optional — for texting the link"
            />
          </label>
        </div>
        <label className="space-y-2 block">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Notes
          </span>
          <textarea
            className={`${inputClass} min-h-[88px]`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={uploading}
          onClick={() => void upload()}
          className="px-6 py-3 rounded-2xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
        >
          {uploading ? 'Saving…' : 'Store document'}
        </button>
      </section>
      )}

      {vaultView === 'packets' && (
      <section className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-6 sm:p-8 border-b border-slate-800">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <FileSignature className="w-4 h-4" />
            {folder === 'esign' ? 'Stored e-signs' : 'Folder'}
          </h3>
        </div>
        {loading ? (
          <p className="p-8 text-sm text-slate-500 font-bold">Loading documents…</p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-sm text-slate-500 font-bold">
            Nothing in this folder yet. Open the library to send a form, or upload a one-off PDF.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {visible.map((doc) => (
              <li key={doc.id} className="p-5 sm:p-6 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{doc.title}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${statusClass(doc.status)}`}>
                      {statusLabel(doc.status)}
                      {doc.signerName ? ` · ${doc.signerName}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {doc.lienRelease
                        ? `${doc.lienRelease.invoiceNo ? `Inv ${doc.lienRelease.invoiceNo} · ` : ''}$${doc.lienRelease.amountUsd.toLocaleString()} · River House`
                        : doc.sourceFileName}
                      {doc.completedAt
                        ? ` · signed ${new Date(doc.completedAt).toLocaleDateString()}`
                        : ` · ${new Date(doc.uploadedAt).toLocaleDateString()}`}
                      {doc.sentChannel === 'email'
                        ? ` · emailed ${doc.signerEmail ?? ''}`
                        : doc.sentChannel === 'sms'
                          ? ` · texted ${doc.signerPhone ?? ''}`
                          : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setViewer({
                          title: doc.title,
                          url: api.vaultDocumentFileUrl(
                            doc.id,
                            doc.status === 'completed' ? 'signed' : 'original',
                          ),
                          contentType:
                            doc.status === 'completed' ? 'application/pdf' : doc.contentType,
                        })
                      }
                      className="px-3 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 min-h-[40px]"
                    >
                      <FileText className="w-3.5 h-3.5 inline mr-1" />
                      View
                    </button>
                    {doc.status !== 'completed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openSend(doc)}
                          className="px-3 py-2 rounded-2xl bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px]"
                        >
                          <Mail className="w-3.5 h-3.5 inline mr-1" />
                          Email or text
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSignDoc(doc);
                            setSignName(doc.signerName ?? '');
                            setSignature(null);
                            setConsent(false);
                          }}
                          className="px-3 py-2 rounded-2xl bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px]"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                          Sign now
                        </button>
                      </>
                    )}
                    {doc.viewerToken && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(publicLink(doc.viewerToken!));
                          onToast('Link copied', 'success');
                        }}
                        className="px-3 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-300 min-h-[40px]"
                      >
                        <Copy className="w-3.5 h-3.5 inline mr-1" />
                        Copy
                      </button>
                    )}
                    {doc.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() =>
                          void api
                            .updateVaultDocument(doc.id, { status: 'cancelled' })
                            .then(load)
                            .catch((e) =>
                              onToast(e instanceof Error ? e.message : 'Cancel failed', 'error'),
                            )
                        }
                        className="px-3 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500 min-h-[40px]"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm(`Delete ${doc.title}?`)) return;
                        void api
                          .deleteVaultDocument(doc.id)
                          .then(() => {
                            onToast('Deleted', 'success');
                            return load();
                          })
                          .catch((e) =>
                            onToast(e instanceof Error ? e.message : 'Delete failed', 'error'),
                          );
                      }}
                      className="px-3 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-[10px] font-black uppercase tracking-widest text-red-400 min-h-[40px]"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {viewer && (
        <ReceiptViewerModal
          title={viewer.title}
          imageUrl={viewer.url}
          openUrl={viewer.url}
          contentType={isPdfContentType(viewer.contentType) ? viewer.contentType : viewer.contentType}
          onClose={() => setViewer(null)}
        />
      )}

      {sendDoc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-[32px] border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-black text-white">Send signing link</h3>
            <p className="text-xs text-slate-400">{sendDoc.title}</p>
            <label className="space-y-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Signer name
              </span>
              <input
                className={inputClass}
                value={sendName}
                onChange={(e) => setSendName(e.target.value)}
                placeholder="Contractor or signer"
              />
            </label>
            <label className="space-y-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Email
              </span>
              <input
                className={inputClass}
                type="text"
                inputMode="email"
                autoComplete="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="contractor@email.com"
              />
            </label>
            <label className="space-y-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Phone
              </span>
              <input
                className={inputClass}
                type="tel"
                value={sendPhone}
                onChange={(e) => setSendPhone(e.target.value)}
                placeholder="435-720-6914"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendLink('email')}
                className="flex-1 px-4 py-3 rounded-2xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 inline mr-1" />
                    Email link
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendLink('sms')}
                className="flex-1 px-4 py-3 rounded-2xl bg-cyan-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  <>
                    <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                    Text link
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendLink('none')}
                className="px-4 py-3 rounded-2xl bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest min-h-[44px]"
              >
                Copy only
              </button>
              <button
                type="button"
                onClick={() => setSendDoc(null)}
                className="px-4 py-3 rounded-2xl bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {signDoc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-[32px] border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-black text-white">Sign {signDoc.title}</h3>
            <label className="space-y-2 block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Full legal name
              </span>
              <input
                className={inputClass}
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
              />
            </label>
            <SignaturePad onChange={setSignature} disabled={signing} />
            <label className="flex items-start gap-3 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>
                I choose to use electronic documents. My electronic signature has the same effect as
                a written ink signature. Utah Mountain Luxury Management will keep the authoritative
                copy.
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={signing}
                onClick={() => void signNow()}
                className="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest min-h-[44px]"
              >
                {signing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Complete e-sign'}
              </button>
              <button
                type="button"
                onClick={() => setSignDoc(null)}
                className="px-4 py-3 rounded-2xl bg-slate-800 text-slate-300 text-xs font-black uppercase tracking-widest min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
