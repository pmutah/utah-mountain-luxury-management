import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { guestArrivalLine } from '../lib/arrival';

/** Preference arrival times by reservation id. Phones and other typed windows are dropped. */
export function useArrivalWindows(): Record<string, string> | null {
  const [windows, setWindows] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let cancel = false;
    api
      .getGuestSurveys()
      .then((data) => {
        if (cancel) return;
        const next: Record<string, string> = {};
        for (const survey of data.surveys ?? []) {
          const raw = survey.answers?.arrivalWindow ?? '';
          if (guestArrivalLine(raw)) next[survey.reservationId] = raw;
        }
        setWindows(next);
      })
      .catch(() => {
        if (!cancel) setWindows(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return windows;
}
