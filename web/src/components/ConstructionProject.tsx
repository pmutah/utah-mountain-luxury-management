import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, HardHat, Trash2, Upload } from 'lucide-react';
import {
  api,
  formatCurrency,
  type ConstructionDocument,
  type ConstructionProject as Project,
  type ConstructionRecommendation,
} from '../lib/api';

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) reject(new Error('Failed to read file'));
      else resolve({ base64, mimeType: file.type || 'application/pdf' });
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { base64, mimeType } = await fileToBase64(file);
        await api.uploadConstructionDocument({
          fileBase64: base64,
          mimeType,
          fileName: file.name,
        });
      }
      onToast('Document(s) uploaded and analyzed', 'success');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
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
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-black uppercase disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Processing…' : 'Upload'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Plans, bids, estimates, invoices, contracts — PDF or images. Gemini extracts scope and
          amounts for your Construction Manager.
        </p>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-8">No documents yet.</p>
        ) : (
          <ul className="space-y-3">
            {documents.map((d) => (
              <DocumentRow key={d.id} doc={d} onDelete={() => void onDelete(d.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocumentRow({ doc, onDelete }: { doc: ConstructionDocument; onDelete: () => void }) {
  const hasFile = Boolean(doc.storagePath);
  return (
    <li className="flex gap-3 items-start bg-slate-950/40 rounded-2xl p-3 border border-slate-800/50">
      <FileText className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
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
          <a
            href={api.constructionDocumentFileUrl(doc.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs font-bold text-amber-400 hover:text-amber-300"
          >
            View file
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="p-2 text-slate-500 hover:text-red-400"
        aria-label="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}
