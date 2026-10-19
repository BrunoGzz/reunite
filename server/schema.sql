CREATE TABLE IF NOT EXISTS shelters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  shelter_id INTEGER NOT NULL REFERENCES shelters(id),
  name TEXT,
  name_is_alias INTEGER NOT NULL DEFAULT 0,
  sex TEXT NOT NULL DEFAULT 'unknown',
  age INTEGER,
  height TEXT NOT NULL DEFAULT 'unknown',
  hair_color TEXT,
  marks TEXT,
  languages TEXT,
  last_place TEXT,
  last_seen_day TEXT,
  last_seen_part TEXT,
  arrival_method TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0,
  needs_assistance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY,
  shelter_id INTEGER NOT NULL REFERENCES shelters(id),
  searcher_person_id INTEGER NOT NULL REFERENCES people(id),
  name TEXT,
  sex TEXT NOT NULL DEFAULT 'unknown',
  age INTEGER,
  height TEXT NOT NULL DEFAULT 'unknown',
  hair_color TEXT,
  marks TEXT,
  languages TEXT,
  last_place TEXT,
  last_seen_day TEXT,
  last_seen_part TEXT,
  arrival_method TEXT,
  email TEXT,
  email_opt_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  closed_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  search_id INTEGER NOT NULL REFERENCES searches(id),
  person_id INTEGER NOT NULL REFERENCES people(id),
  score INTEGER NOT NULL,
  name_score REAL,
  reasons TEXT NOT NULL,
  is_reciprocal INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  UNIQUE (search_id, person_id)
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  from_shelter_id INTEGER NOT NULL REFERENCES shelters(id),
  to_shelter_id INTEGER NOT NULL REFERENCES shelters(id),
  routed_to TEXT NOT NULL DEFAULT 'shelter', -- 'shelter', or 'review' for minors and people who need help deciding
  message TEXT,
  photo_file TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  shelter_id INTEGER REFERENCES shelters(id),
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  to_address TEXT,
  match_id INTEGER,
  request_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_filter ON people (sex, age);
CREATE INDEX IF NOT EXISTS idx_searches_status ON searches (status);
