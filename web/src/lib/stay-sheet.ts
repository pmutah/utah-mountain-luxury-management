function longDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type TripSheet = {
  house: string;
  when: string;
  address: string;
  privateNote: string;
  arrival: string;
  parking: string;
  rules: string;
  checkout: string[];
};

/** Paper copy of a stay. Door codes and Wi-Fi are not fields on this sheet. */
export function tripSheet(input: {
  house: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  address?: string;
  arrival?: string;
  parking?: string;
  rules?: string;
  checkout?: readonly string[];
}): TripSheet {
  return {
    house: input.house,
    when: `Check-in ${input.checkInTime} on ${longDate(input.checkIn)}. Checkout ${input.checkOutTime} on ${longDate(input.checkOut)}.`,
    address: input.address?.trim() ?? '',
    privateNote: 'Door code and Wi-Fi stay on the phone. They are not on this paper.',
    arrival: input.arrival?.trim() ?? '',
    parking: input.parking?.trim() ?? '',
    rules: input.rules?.trim() ?? '',
    checkout: (input.checkout ?? []).map((step) => step.trim()).filter(Boolean),
  };
}
