-- Growth and funnel rows. New tables only: no expense, booking, or receipt key is touched.
-- Stored in D1 because a funnel row per page view would spend the KV write budget in a day.

CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step TEXT NOT NULL,
  house TEXT NOT NULL,
  -- A random visit id, never an address, a name, or a phone. Enough to count a funnel, no more.
  visit TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS funnel_events_step ON funnel_events (step, created_at);

CREATE TABLE IF NOT EXISTS ab_assignments (
  visit TEXT NOT NULL,
  experiment TEXT NOT NULL,
  variant TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (visit, experiment)
);
