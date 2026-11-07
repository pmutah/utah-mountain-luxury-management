/**
 * An empty read must not replace the ledger, and rows that are not turnover cleaning must not shrink.
 *
 * This is the guard that sits in front of the turnover-cleaning write, and it had the comparison
 * backwards in one direction: `previous.length === 0` returned `false`, so on a ledger that had never
 * been written the cleaning rows were silently never created — the caller logged nothing and
 * returned zero, so a fresh deployment quietly had no turnover cleaning expenses at all.
 *
 * An empty *previous* list is not a danger, it is the first write. What must be refused is losing
 * rows that are already saved: a write that would leave fewer non-cleaning rows than it found.
 * Bootstrapping a ledger is allowed; shrinking one is not.
 */
export function ledgerSafeToSave(
  previous: readonly { id?: string }[],
  next: readonly { id?: string }[],
): boolean {
  const kept = (rows: readonly { id?: string }[]) =>
    rows.filter((row) => !String(row.id ?? '').startsWith('clean-')).length;
  // A first write is fine. Nothing saved means nothing to lose.
  if (previous.length === 0) return true;
  return kept(next) >= kept(previous);
}
