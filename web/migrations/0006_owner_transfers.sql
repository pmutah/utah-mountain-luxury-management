-- Money a host records as sent to Todd, or returned by him.
--
-- The owner statement already computes Ranch and River after the fee, then half. This table does not
-- change that figure, and it is not an expense, a booking, or a receipt. A void keeps the row.

CREATE TABLE IF NOT EXISTS owner_transfers (
  id TEXT PRIMARY KEY,
  house TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_on TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  voided_at TEXT
);
