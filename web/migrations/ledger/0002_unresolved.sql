-- Rows the KV import could read but could not place.
-- `reservations` and `expenses` refuse a null house, date, month, category, or
-- amount. Those rows are kept here instead of being dropped or aborting the
-- batch. A later import removes a row once it can be inserted.

CREATE TABLE IF NOT EXISTS ledger_unresolved (
  source_key TEXT NOT NULL,
  id TEXT NOT NULL,
  guest TEXT,
  dates TEXT,
  missing TEXT NOT NULL,
  raw_fields TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_key, id)
);
