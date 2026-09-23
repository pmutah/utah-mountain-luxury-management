import { useState, type FormEvent } from 'react';
import { PROPERTIES } from '../lib/api';
import { BrandMark } from './BrandMark';

const HOUSES = ['ranch', 'lindon', 'river'] as const;

export function DirectBook() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    propertyId: 'river',
    checkIn: '',
    checkOut: '',
    note: '',
    returning: true,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not send the request');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#07110f] text-[#f4f1ea] px-4 py-10">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <BrandMark />
          <div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-[#8fa39c]">Utah Mountain Luxury</p>
            <h1 className="font-display text-4xl">Request the house</h1>
          </div>
        </div>
        <p className="text-sm text-[#c5d0cc] mb-6">
          Returning guests can ask for dates directly. We confirm by email. This does not charge a card.
        </p>
        {sent ? (
          <p className="font-display text-3xl">We have the request. Someone will write back.</p>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <input required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3" />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3" />
            <input placeholder="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3" />
            <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full bg-[#102421] border border-[#d4b56a55] rounded-2xl px-4 py-3">
              {HOUSES.map((id) => (
                <option key={id} value={id}>{PROPERTIES[id].name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" aria-label="Check in" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className="bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3" />
              <input type="date" aria-label="Check out" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className="bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3" />
            </div>
            <textarea placeholder="Anything we should know" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full bg-transparent border border-[#d4b56a55] rounded-2xl px-4 py-3 min-h-24" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.returning} onChange={(e) => setForm({ ...form, returning: e.target.checked })} />
              I have stayed with Utah Mountain Luxury before
            </label>
            {error && <p className="text-red-300 text-sm">{error}</p>}
            <button type="submit" disabled={busy} className="rounded-full px-5 py-3 bg-[#d4b56a] text-[#1a1408] uppercase tracking-[0.16em] text-xs">
              {busy ? 'Sending' : 'Request these dates'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
