-- A guest's add-on request, waiting for a host to notice it.
--
-- Filing a row does not move a booking, charge a card, order anything, or send a text.
-- The stay itself stays in KV. This table is new and lives in the market database.
-- A guest name, an address, and a phone number do not belong in it.

CREATE TABLE IF NOT EXISTS stay_requests (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  house TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
