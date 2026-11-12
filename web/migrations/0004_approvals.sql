-- A waiting list for a refund or a guardrail override.
--
-- The host files the request here. It stays waiting until a host marks it approved or declined.
-- Approving a row does not refund a guest, publish a rate, send a text, or change an expense,
-- a booking, or a receipt. Those books stay in KV. This table is new and lives in the market database.

CREATE TABLE IF NOT EXISTS approval_queue (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  house TEXT NOT NULL,
  summary TEXT NOT NULL,
  amount_cents INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
