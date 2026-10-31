CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  phase TEXT NOT NULL DEFAULT 'waiting',
  duration INTEGER NOT NULL DEFAULT 300,
  started_at INTEGER,
  paused_at INTEGER,
  elapsed_before_pause INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(challenge_id, name)
);
CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  icon_url TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,
  correct INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS drawings_challenge ON drawings(challenge_id);
CREATE INDEX IF NOT EXISTS drawings_player ON drawings(player_id);