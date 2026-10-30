import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { guestArrivalLine } from '../lib/arrival';
import { guestDepartureLine } from '../lib/departure';

export type PreferenceTimes = {
  arrival: Record<string, string>;
  departure: Record<string, string>;
};

/** Preference arrival and departure times by reservation id. Phones and other typed values are dropped. */
export function usePreferenceTimes(): PreferenceTimes | null {
  const [times, setTimes] = useState<PreferenceTimes | null>(null);
  useEffect(() => {
    let cancel = false;
    api
      .getGuestSurveys()
      .then((data) => {
        if (cancel) return;
        const arrival: Record<string, string> = {};
        const departure: Record<string, string> = {};
        for (const survey of data.surveys ?? []) {
          const arrive = survey.answers?.arrivalWindow ?? '';
          const leave = survey.answers?.earlyLate ?? '';
          if (guestArrivalLine(arrive)) arrival[survey.reservationId] = arrive;
          if (guestDepartureLine(leave)) departure[survey.reservationId] = leave;
        }
        setTimes({ arrival, departure });
      })
      .catch(() => {
        if (!cancel) setTimes(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return times;
}
