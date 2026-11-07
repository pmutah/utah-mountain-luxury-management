/** A failed guest-list read. An empty book is a different case. */
export function guestListUnreadable(message: string): boolean {
  return /could not be read|limit exceeded|storage writes are paused|storage reads are paused|error code:\s*1101/i.test(message);
}

export function guestListUnreadNote(): string {
  return 'Saved bookings could not be read. This list is not using a stand-in. Nothing was written over them.';
}

/** Mail and text status while the guest list could not be read. It does not say they are disconnected. */
export function guestMailUnreadLine(): string {
  return 'Saved bookings could not be read. This page does not say whether mail or text is connected. Nothing is sent.';
}

/** The guide editor stays shut while bookings cannot be read. Nothing is written. */
export function guestEditorLockLine(): string {
  return 'Saved bookings could not be read. This editor stays closed. Nothing was written over the guide.';
}

/** How a guest link works. An unread list does not show one. */
export function guestLinkNote(unreadable: boolean): string {
  if (unreadable) return 'Saved bookings could not be read. This page does not show a guest link. Nothing is sent.';
  return 'Each stay gets one guest app link: the preference form before arrival, then door code, Wi-Fi, the house guide, and area picks. Send it by email or text, or copy it to paste in Airbnb. Guest URL: /stay/<token>';
}
