import { useEffect, useState } from 'react';
import { api, type GuestPreferenceAnswers } from '../lib/api';
import { GuestClassicPreferenceForm } from './GuestClassicPreferenceForm';
import { GuestVipSurvey } from './GuestVipSurvey';

export function GuestPreferenceForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<{
    guestName: string;
    propertyId?: string;
    propertyName: string;
    checkIn: string;
    checkOut: string;
    variant?: 'vip' | 'classic';
  } | null>(null);
  const [answers, setAnswers] = useState<GuestPreferenceAnswers>({});
  const [saving, setSaving] = useState(false);
  const [guideOn, setGuideOn] = useState(false);

  useEffect(() => {
    void api
      .getStayGuide(token)
      .then((result) => setGuideOn(result.enabled))
      .catch(() => setGuideOn(false));
  }, [token]);

  useEffect(() => {
    void api
      .getPublicStayPreference(token)
      .then((data) => {
        setMeta({
          guestName: data.guestName,
          propertyId: data.propertyId,
          propertyName: data.propertyName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          variant: data.variant,
        });
        if (data.answers) setAnswers(data.answers);
        if (data.completed) setDone(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'This link is not valid.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const variant =
        meta?.variant ?? (meta?.propertyId === 'river' ? 'vip' : 'classic');
      await api.submitPublicStayPreference(token, { ...answers, surveyVariant: variant });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="guest-survey min-h-screen flex items-center justify-center text-[#d7cfc3]">
        Loading your stay…
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen bg-[#0c1412] text-[#d7cfc3] flex items-center justify-center p-6">
        <p className="max-w-md text-center">{error}</p>
      </div>
    );
  }

  if (!meta) return null;

  const vip = meta.variant === 'vip' || meta.propertyId === 'river';

  if (vip) {
    return (
      <GuestVipSurvey
        meta={meta}
        answers={answers}
        setAnswers={setAnswers}
        saving={saving}
        error={error}
        done={done}
        guideHref={guideOn ? `/stay/${encodeURIComponent(token)}` : undefined}
        onSubmit={() => void submit()}
      />
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
          {guideOn ? (
            <>
              <p className="text-stone-600 leading-relaxed">
                We’ll use this to set the house for your group. Your door code and Wi-Fi appear in your stay
                guide the day before check-in.
              </p>
              <a
                href={`/stay/${encodeURIComponent(token)}`}
                className="inline-block rounded-full bg-stone-800 px-5 py-2.5 text-sm text-white"
              >
                Open your stay guide
              </a>
            </>
          ) : (
            <p className="text-stone-600 leading-relaxed">
              We’ll use this to set the house for your group. Door codes and the house guide arrive a few
              days before check-in.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <GuestClassicPreferenceForm
      meta={meta}
      answers={answers}
      setAnswers={setAnswers}
      saving={saving}
      error={error}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    />
  );
}
