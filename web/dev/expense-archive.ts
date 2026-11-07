/**
 * Local preview only. The deployed route reads the real archive from KV. This fixture serves one
 * removed row so the panel and the restore button can be checked in a dev browser, and lets a
 * restore remove it so the empty state can be seen too. Nothing here touches the real ledger.
 *
 * The shapes are written out locally rather than imported from `_lib`, because those modules pull
 * Workers types into the app build, which has no `KVNamespace`.
 */
type ArchivedExpense = {
  expense: {
    id: string;
    month: string;
    propertyId: string;
    category: string;
    amount: number;
    note?: string;
    vendor?: string;
    paidBy?: string;
    paidDate?: string;
    createdAt?: string;
    receiptStoragePath?: string | null;
  };
  removedAt: string;
  reason?: string;
};

const TODAY = new Date().toISOString();

const rows: ArchivedExpense[] = [
  {
    expense: {
      id: 'preview-removed',
      month: '2026-11',
      propertyId: 'household',
      category: 'Furnishings',
      amount: 148.5,
      note: 'Lamp for the entry, returned to the store',
      vendor: 'Target',
      paidBy: 'brandon',
      paidDate: '2026-11-02',
      createdAt: '2026-11-02T16:00:00.000Z',
      receiptStoragePath: 'receipts/preview-removed.pdf',
    },
    removedAt: TODAY,
    reason: 'returned to the store',
  } as ArchivedExpense,
  {
    expense: {
      id: 'preview-removed-2',
      month: '2026-10',
      propertyId: 'household',
      category: 'Supplies',
      amount: 62.4,
      note: 'Entry mat, wrong size',
      vendor: 'Amazon',
      paidBy: 'brandon',
      paidDate: '2026-10-28',
      createdAt: '2026-10-28T11:00:00.000Z',
      receiptStoragePath: 'receipts/preview-removed-2.pdf',
    },
    removedAt: TODAY,
    reason: 'wrong size',
  } as ArchivedExpense,
];

export function devExpenseArchive() {
  return {
    archived: rows.map((row) => ({
      id: row.expense.id,
      removedAt: row.removedAt,
      ...(row.reason ? { reason: row.reason } : {}),
      description: row.expense.note ?? row.expense.category ?? '',
      amount: row.expense.amount,
      propertyId: row.expense.propertyId ?? null,
      date: row.expense.paidDate ?? row.expense.month ?? null,
      hasReceipt: Boolean(row.expense.receiptStoragePath),
    })),
    line: `${rows.length === 1 ? '1 removed expense can be restored' : `${rows.length} removed expenses can be restored`}. They are not counted in any total while they sit here.`,    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

/** Remove one preview row, so the empty state can be checked. */
export function devRestoreExpense(id: string) {
  const at = rows.findIndex((row) => row.expense.id === id);
  if (at < 0) return { status: 404 as const, error: 'That expense is not in the archive.' };
  rows.splice(at, 1);
  return {
    status: 200 as const,
    ok: true,
    restored: id,
    line: 'That expense is back on the books. (Preview: no real ledger row was changed.)',
  };
}

/** Drop one preview row for good, so the purge control can be checked. */
export function devPurgeExpense(id: string) {
  const at = rows.findIndex((row) => row.expense.id === id);
  if (at < 0) {
    return { status: 404 as const, error: 'That expense is not in the archive. A live expense is removed, not purged.' };
  }
  rows.splice(at, 1);
  return {
    status: 200 as const,
    ok: true,
    purged: id,
    line: 'The row and its files are gone. That cannot be undone. (Preview: nothing real was deleted.)',
  };
}
