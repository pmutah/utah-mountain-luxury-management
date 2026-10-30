/** An empty read must not replace the ledger. Rows that are not turnover cleaning must not shrink. */
export function ledgerSafeToSave(
  previous: readonly { id?: string }[],
  next: readonly { id?: string }[],
): boolean {
  if (previous.length === 0) return false;
  const kept = (rows: readonly { id?: string }[]) =>
    rows.filter((row) => !String(row.id ?? '').startsWith('clean-')).length;
  return kept(next) >= kept(previous);
}
