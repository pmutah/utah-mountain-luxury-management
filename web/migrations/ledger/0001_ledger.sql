-- One row per reservation, seed override, and expense.
-- The old KV keys (reservations, reservationOverrides, customExpenses) stay
-- readable until POST /api/ledger/migrate copies them. After that flag is set,
-- the app writes these rows and does not put the whole list back into KV.
--
-- Re-running the import uses INSERT OR IGNORE and skips ledger_tombstones, so
-- a second pass can pick up a row the first (stale) KV read missed without
-- putting a deleted row back.

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  property_id TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  status TEXT,
  source TEXT,
  payout REAL,
  ical_uid TEXT,
  body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_ical ON reservations(ical_uid);
CREATE INDEX IF NOT EXISTS idx_reservations_stay ON reservations(property_id, check_in, check_out);

CREATE TABLE IF NOT EXISTS reservation_overrides (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  property_id TEXT NOT NULL,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_property_month ON expenses(property_id, month);

CREATE TABLE IF NOT EXISTS ledger_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_tombstones (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);
