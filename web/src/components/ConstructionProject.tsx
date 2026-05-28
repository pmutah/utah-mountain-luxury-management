import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, FileText, HardHat, Loader2, Trash2, Upload } from 'lucide-react';
import {
  api,
  formatCurrency,
  type ConstructionDocument,
  type ConstructionProject as Project,
  type ConstructionRecommendation,
} from '../lib/api';
import { CONSTRUCTION_MAX_BYTES, CONSTRUCTION_MAX_MB } from '../lib/construction-limits';
import { isMobileDevice, isPdfContentType } from '../lib/device';
import { ReceiptViewerModal } from './ReceiptViewerModal';

type DocFilter = 'all' | 'plan' | 'bid' | 'invoice' | 'photo';

const FILTER_CHIPS: { id: DocFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'plan', label: 'Plans' },
  { id: 'bid', label: 'Bids' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'photo', label: 'Photos' },
];

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  return { base64: btoa(binary), mimeType };
}

function docIsPhoto(doc: ConstructionDocument): boolean {
  return Boolean(doc.contentType?.startsWith('image/'));
}

function docIsPdf(doc: ConstructionDocument): boolean {
  if (isPdfContentType(doc.contentType)) return true;
  const path = doc.storagePath ?? '';
  if (path.endsWith('.pdf') || path.includes('.pdf')) return true;
  return (doc.sourceFileName ?? doc.title).toLowerCase().endsWith('.pdf');
}

function matchesFilter(doc: ConstructionDocument, filter: DocFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'plan') return doc.type === 'plan';
  if (filter === 'bid') return doc.type === 'bid' || doc.type === 'estimate';
  if (filter === 'invoice') return doc.type === 'invoice';
  if (filter === 'photo') return docIsPhoto(doc);
  return true;
}

export function ConstructionProjectView({
  onError,
  onToast,
}: {
  onError: (msg: string) => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<ConstructionDocument[]>([]);
  const [recommendations, setRecommendations] = useState<ConstructionRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [dragOver, setDragOver] = useState(false);
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [firebaseStorage, setFirebaseStorage] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, docs, recs] = await Promise.all([
        api.getConstructionProject(),
        api.getConstructionDocuments(),
        api.getConstructionRecommendations(),
      ]);
      setProject(p);
      setDocuments(docs.documents);
      setFirebaseStorage(docs.limits?.firebaseConfigured ?? null);
      setRecommendations(recs.recommendations);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to load construction project');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const invoiced = documents
    .filter((d) => d.type === 'invoice' && d.amount)
    .reduce((s, d) => s + (d.amount ?? 0), 0);

  const filteredDocuments = documents.filter((d) => matchesFilter(d, docFilter));

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(true);
    setUploadProgress({ current: 0, total: list.length });
    let saved = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        setUploadProgress({ current: i + 1, total: list.length });
        if (file.size > CONSTRUCTION_MAX_BYTES) {
          onError(`${file.name} exceeds the ${CONSTRUCTION_MAX_MB} MB limit.`);
          continue;
        }
        if (firebaseStorage === false && file.size > 4 * 1024 * 1024) {
          onToast(
            `${file.name} is large — add FIREBASE_SERVICE_ACCOUNT_JSON in Cloudflare for best reliability (see DEPLOY.md).`,
            'info',
          );
        }
        const { base64, mimeType } = await fileToBase64(file);
        const doc = await api.uploadConstructionDocument({
          fileBase64: base64,
          mimeType,
          fileName: file.name,
        });
        const warning = (doc as ConstructionDocument & { ingestWarning?: string }).ingestWarning;
        if (warning) onToast(warning, 'info');
        saved++;
      }
      onToast(
        saved === 1 ? 'Document uploaded and analyzed' : `${saved} documents uploaded`,
        'success',
      );
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.deleteConstructionDocument(id);
      onToast('Document deleted', 'info');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const dismissRec = async (id: string) => {
    try {
      await api.dismissConstructionRecommendation(id);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to dismiss');
    }
  };

  if (loading && !project) {
    return <p className="text-slate-500 text-sm animate-pulse">Loading construction project…</p>;
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 rounded-[40px] border border-amber-800/30 p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <HardHat className="w-8 h-8 text-amber-400 shrink-0" />
          <div>
            <h2 className="text-xl font-black text-white">{project.name}</h2>
            <p className="text-sm text-slate-500 mt-1">{project.address}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/90 mt-2">
              {project.currentStage}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Budget target</p>
            <p className="text-2xl font-black text-white mt-1">
              {formatCurrency(project.budgetTarget)}
            </p>
          </div>
          <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Invoiced to date</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{formatCurrency(invoiced)}</p>
          </div>
        </div>
        {project.budgetTarget > 0 && (
          <div className="mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, (invoiced / project.budgetTarget) * 100)}%` }}
            />
          </div>
        )}
      </section>

      {recommendations.length > 0 && (
        <section className="bg-slate-900 rounded-[40px] border border-slate-800 p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">
            Foreman recommendations
          </h3>
          <ul className="space-y-4">
            {recommendations.map((r) => (
              <li key={r.id} className="border-b border-slate-800/50 pb-4 last:border-0">
                <div className="flex justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase text-amber-500">{r.priority}</span>
                  <button
                    type="button"
                    onClick={() => void dismissRec(r.id)}
                    className="text-[10px] text-slate-500 hover:text-white uppercase"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="font-bold text-slate-200 mt-1">{r.title}</p>
                <p className="text-sm text-slate-400 mt-1 whitespace-pre-wrap">{r.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-slate-900 rounded-[40px] border border-slate-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Documents</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-amber-300 text-xs font-black uppercase disabled:opacity-50 min-h-[44px]"
            >
              Photo
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-black uppercase disabled:opacity-50 min-h-[44px]"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onUpload(e.dataTransfer.files);
          }}
          className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors mb-4 ${
            dragOver ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-950/50'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <p className="text-xs font-bold uppercase tracking-widest">
                {uploadProgress
                  ? `Analyzing ${uploadProgress.current} of ${uploadProgress.total}…`
                  : 'Processing…'}
              </p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-slate-500 mb-2" />
              <p className="text-sm font-bold text-slate-300 mb-1">
                Drop plans, bids, invoices, or photos here
              </p>
              <p className="text-xs text-slate-500 mb-3">
                PDF or images up to {CONSTRUCTION_MAX_MB} MB
                {firebaseStorage === false ? ' · Firebase recommended for large plans (DEPLOY.md)' : ''}
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-2 bg-amber-600 rounded-xl text-xs font-black uppercase min-h-[44px] text-white"
              >
                Choose files
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setDocFilter(chip.id)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider min-h-[36px] ${
                docFilter === chip.id
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-10 px-4">
            <FileText className="w-12 h-12 mx-auto text-slate-700 mb-3" />
            <p className="text-sm font-bold text-slate-400">
              Upload plans and bids so your Construction Manager can advise on this project
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Or use the paperclip in the amber Build chat to upload while you talk.
            </p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-8">No documents match this filter.</p>
        ) : (
          <ul className="space-y-3">
            {filteredDocuments.map((d) => (
              <DocumentRow
                key={d.id}
                doc={d}
                onDelete={() => void onDelete(d.id)}
                onToast={onToast}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocumentRow({
  doc,
  onDelete,
  onToast,
}: {
  doc: ConstructionDocument;
  onDelete: () => void;
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const hasFile = Boolean(doc.storagePath);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const fileEndpoint = api.constructionDocumentFileUrl(doc.id);
  const pdf = docIsPdf(doc);
  const photo = docIsPhoto(doc);

  const openFile = async () => {
    if (!hasFile) {
      onToast('No file stored for this document.', 'info');
      return;
    }
    if (pdf) {
      setViewerSrc(fileEndpoint);
      setViewerContentType('application/pdf');
      setViewerOpen(true);
      return;
    }
    setLoadingFile(true);
    try {
      const res = await fetch(fileEndpoint, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load file');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setViewerSrc(objectUrl);
      setViewerContentType(blob.type || doc.contentType || null);
      setViewerOpen(true);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not open file', 'info');
    } finally {
      setLoadingFile(false);
    }
  };

  const closeViewer = () => {
    setViewerOpen(false);
    if (viewerSrc?.startsWith('blob:')) URL.revokeObjectURL(viewerSrc);
    setViewerSrc(null);
    setViewerContentType(null);
  };

  return (
    <>
      <li className="flex gap-3 items-start bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
        {photo && hasFile ? (
          <button
            type="button"
            onClick={() => void openFile()}
            className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-900"
            aria-label="Open photo"
          >
            <img
              src={fileEndpoint}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ) : (
          <FileText className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold uppercase text-slate-500">{doc.type}</span>
            {doc.amount != null && (
              <span className="text-xs font-bold text-amber-400">{formatCurrency(doc.amount)}</span>
            )}
          </div>
          <p className="font-bold text-slate-200 text-sm truncate">{doc.title}</p>
          {doc.vendor && <p className="text-xs text-slate-500">{doc.vendor}</p>}
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.extractedSummary}</p>
          {hasFile && (
            <button
              type="button"
              disabled={loadingFile}
              onClick={() => void openFile()}
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-2 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-wider"
            >
              {loadingFile ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {pdf ? 'Open PDF' : 'Open'}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-2 text-slate-500 hover:text-red-400 min-h-[44px] min-w-[44px]"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </li>
      {viewerOpen && viewerSrc && (
        <ReceiptViewerModal
          title={doc.title}
          imageUrl={viewerSrc}
          openUrl={pdf && isMobileDevice() ? fileEndpoint : undefined}
          contentType={viewerContentType}
          onClose={closeViewer}
        />
      )}
    </>
  );
}
