import { useEffect, useState } from 'react';
import { CheckCircle2, FileSignature } from 'lucide-react';
import { api } from '../lib/api';
import { isMobileDevice } from '../lib/device';
import { SignaturePad } from './SignaturePad';

export function EsignCeremony({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    title: string;
    folderLabel: string;
    signerName: string;
    completed: boolean;
    expired: boolean;
    cancelled: boolean;
  } | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void api
      .getPublicEsign(token)
      .then((data) => {
        setMeta(data);
        setSignerName(data.signerName);
        if (data.completed) setDone(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'This link is not valid.'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!signerName.trim()) {
      setError('Type your full legal name.');
      return;
    }
    if (!signature) {
      setError('Draw your signature.');
      return;
    }
    if (!consent) {
      setError('Consent is required to sign electronically.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.completePublicEsign(token, {
        signerName: signerName.trim(),
        signatureDataUrl: signature,
        consentAccepted: true,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete signing.');
    } finally {
      setSubmitting(false);
    }
  };

  const fileUrl = api.publicEsignFileUrl(token);
  const mobile = isMobileDevice();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 pb-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="pt-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">
            Utah Mountain Luxury Management
          </p>
          <h1 className="text-2xl font-black text-white mt-2 flex items-center gap-2">
            <FileSignature className="w-6 h-6" />
            Electronic signature
          </h1>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500 font-bold">Loading document…</p>
        ) : error && !meta ? (
          <p className="text-sm text-red-400 font-bold">{error}</p>
        ) : done ? (
          <section className="bg-slate-900 rounded-[32px] border border-emerald-800/50 p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-black text-white">Signed and stored</h2>
            <p className="text-sm text-slate-400">
              Thank you. Utah Mountain Luxury Management has the authoritative signed copy, including
              a certificate of completion.
            </p>
          </section>
        ) : meta?.cancelled || meta?.expired ? (
          <p className="text-sm text-amber-400 font-bold">
            This signing link is no longer active. Ask Utah Mountain Luxury for a new one.
          </p>
        ) : meta ? (
          <>
            <section className="bg-slate-900 rounded-[32px] border border-slate-800 p-6 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {meta.folderLabel}
              </p>
              <h2 className="text-xl font-black text-white">{meta.title}</h2>
              <p className="text-sm text-slate-400">
                Review the document, then sign below. Your electronic signature has the same effect
                as a wet-ink signature.
              </p>
            </section>

            <section className="bg-slate-900 rounded-[32px] border border-slate-800 overflow-hidden">
              {mobile ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-6 text-center text-sm font-black uppercase tracking-widest text-violet-300"
                >
                  Open document
                </a>
              ) : (
                <iframe
                  src={fileUrl}
                  title={meta.title}
                  className="w-full min-h-[560px] bg-white"
                />
              )}
            </section>

            <section className="bg-slate-900 rounded-[32px] border border-slate-800 p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
                Electronic Signature Consent and Acknowledgment
              </h3>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300">
                <li>You choose to use electronic documents and intend to sign them electronically.</li>
                <li>Your electronic signature has the same effect as your written ink signature.</li>
                <li>
                  An authoritative copy will reside with Utah Mountain Luxury Management and is
                  enforceable in electronic or paper form.
                </li>
                <li>
                  You may withdraw consent before you finish signing by closing this page and
                  contacting utahmountainluxury@gmail.com.
                </li>
              </ol>
              <label className="block space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Full legal name
                </span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full rounded-2xl bg-slate-950 border border-slate-800 px-4 py-3 text-white outline-none focus:border-violet-500"
                />
              </label>
              <SignaturePad onChange={setSignature} disabled={submitting} />
              <label className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1"
                />
                I have reviewed the document and consent to sign electronically.
              </label>
              {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="w-full px-6 py-4 rounded-2xl bg-violet-600 text-white text-sm font-black uppercase tracking-widest min-h-[48px] disabled:opacity-60"
              >
                {submitting ? 'Completing…' : 'Complete e-sign'}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
