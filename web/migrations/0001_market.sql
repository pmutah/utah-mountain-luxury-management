-- Market intelligence tables. Existing expense and reservation KV keys are not touched.

CREATE TABLE IF NOT EXISTS comps (
  id TEXT PRIMARY KEY,
  house TEXT NOT NULL,
  name TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  excluded INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comp_nights (
  comp_id TEXT NOT NULL,
  date TEXT NOT NULL,
  rate REAL,
  available INTEGER,
  min_nights INTEGER,
  fetched_on TEXT NOT NULL,
  PRIMARY KEY (comp_id, date)
);

CREATE TABLE IF NOT EXISTS rate_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  house TEXT NOT NULL,
  date TEXT NOT NULL,
  before_rate REAL,
  after_rate REAL,
  reason TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_registry (
  id TEXT PRIMARY KEY,
  area TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  competitor TEXT,
  notes TEXT
);
