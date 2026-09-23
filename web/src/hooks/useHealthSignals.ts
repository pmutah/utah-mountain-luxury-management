import { useEffect, useState } from 'react';
import { api, type GuestSurveyRecord, type PortfolioData, type PricingAlert } from '../lib/api';
import type { HealthSignals, HouseId } from '../lib/luxury';

export function useHealthSignals(data: PortfolioData | null) {
  const [surveys, setSurveys] = useState<GuestSurveyRecord[]>([]);
  const [alerts, setAlerts] = useState<PricingAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getGuestSurveys()
      .then((result) => {
        if (!cancelled) setSurveys(result.surveys);
      })
      .catch(() => {});
    api
      .getPricingAlerts()
      .then((result) => {
        if (!cancelled) setAlerts(result.alerts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data?.month]);

  return (id: HouseId): HealthSignals => {
    if (!data) return {};
    const stays = data.reservations.filter(
      (stay) =>
        stay.propertyId === id &&
        stay.checkIn.startsWith(data.month) &&
        stay.status !== 'cancelled' &&
        stay.status !== 'blocked',
    );
    const surveyCompleted = stays.filter(
      (stay) =>
        stay.surveyCompletedAt ||
        surveys.some((survey) => survey.reservationId === stay.id && survey.completedAt),
    ).length;
    const missingReceipts = data.expenses.filter(
      (expense) =>
        expense.propertyId === id &&
        expense.month === data.month &&
        expense.amount > 0 &&
        !expense.receiptStoragePath,
    ).length;
    return {
      surveyExpected: stays.length,
      surveyCompleted,
      pricingAlerts: alerts.filter((alert) => alert.propertyId === id).length,
      missingReceipts,
    };
  };
}
