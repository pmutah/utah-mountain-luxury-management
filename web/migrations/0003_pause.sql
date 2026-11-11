-- A per-house pricing kill switch.
--
-- The plan's guardrails list "a per-house kill switch". Until now the Market board had a Pause button that flipped a
-- `useState` and nothing else, and the authoritative plan in `/api/pricing/push-plan` hard-coded `paused: false` for every
-- house — so the switch a host pressed was not the switch the plan read.
--
-- This is a new table only. No expense, booking, or receipt is here.

CREATE TABLE IF NOT EXISTS house_pause (
  house TEXT PRIMARY KEY,
  paused INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  updated_at TEXT NOT NULL
);
