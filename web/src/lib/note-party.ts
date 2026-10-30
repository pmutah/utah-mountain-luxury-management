/** A guest count written on a booking note. Names, phones, and the rest of the note stay out. */
export function noteGuestCount(note: string | undefined): number | null {
  if (!note) return null;
  const guests = note.match(/\b(\d{1,2})\s+guests?\b/i);
  if (guests) {
    const count = Number(guests[1]);
    return count >= 1 && count <= 30 ? count : null;
  }
  const adults = note.match(/\b(\d{1,2})\s+adults?\b/i);
  if (!adults) return null;
  const grown = Number(adults[1]);
  const children = note.match(/\b(\d{1,2})\s+children\b/i);
  const kids = children ? Number(children[1]) : 0;
  const count = grown + kids;
  return count >= 1 && count <= 30 ? count : null;
}
