/**
 * Who is looking at this dashboard, as far as the browser needs to know.
 *
 * The server decides what a role may do, and the middleware refuses a write from a read-only account on every route. This
 * module exists so the screen does not offer a control that will answer 403: an owner who can read Ranch and River should not be
 * shown a Save button for a house they cannot save.
 *
 * It is deliberately tiny and holds **no credential** — just the role the server already reported for the signed-in cookie. A
 * tampered value here changes nothing on the server; it only changes which buttons render.
 */

import { useSyncExternalStore } from 'react';

export type ViewerRole = 'admin' | 'owner' | 'cleaner' | 'vendor';

type Viewer = {
  role: ViewerRole;
  /** True for a role the server refuses to let write. */
  readOnly: boolean;
  /** Houses this account may read. `null` means every house. Not known until a session is read. */
  houses: string[] | null;
  /** False until the session has answered, so a control is not flashed and then removed. */
  known: boolean;
};

const UNKNOWN: Viewer = { role: 'admin', readOnly: false, houses: null, known: false };

let current: Viewer = UNKNOWN;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Apply what `/api/auth/session` reported. Called once by the dashboard shell. */
export function setViewer(input: { role?: ViewerRole; readOnly?: boolean; houses?: string[] | null } | null): void {
  if (!input) {
    current = UNKNOWN;
    emit();
    return;
  }
  const role: ViewerRole = input.role ?? 'admin';
  current = {
    role,
    // The server's word wins. The role is the fallback, so the two cannot disagree about an owner.
    readOnly: typeof input.readOnly === 'boolean' ? input.readOnly : role === 'owner',
    houses: input.houses === undefined ? null : input.houses,
    known: true,
  };
  emit();
}

/** Reset for a test, and for a sign-out. */
export function resetViewer(): void {
  current = UNKNOWN;
  emit();
}

export function viewerSnapshot(): Viewer {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current viewer, re-rendering when it is set. */
export function useViewer(): Viewer {
  return useSyncExternalStore(subscribe, viewerSnapshot, viewerSnapshot);
}

/** Whether a write control should be hidden. Unknown reads as writable so nothing flashes on a fast admin load. */
export function useReadOnly(): boolean {
  return useViewer().readOnly;
}
