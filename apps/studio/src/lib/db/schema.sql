-- ============================================================================
-- Valstine Studio — Unified SQLite Schema (Desktop)
-- ============================================================================
-- This DDL covers: connections, SSH tunnels, snippets, favorites/tags,
-- master-password vault, Time-Travel Query Log, workspace recovery,
-- schema snapshots, and UI state.
-- ============================================================================

PRAGMA journal_mode = WAL;          -- concurrent reads during writes
PRAGMA foreign_keys = ON;

-- ── 1. CONNECTIONS & SSH TUNNELS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connections (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  db_type         TEXT NOT NULL CHECK (db_type IN ('pg','mysql','sqlite','mssql')),
  host            TEXT,
  port            INTEGER,
  database_name   TEXT,
  username        TEXT,
  -- encrypted with AES-256; see vault_config
  password_enc    BLOB,
  password_iv     BLOB,             -- AES initialisation vector
  filename        TEXT,             -- SQLite file path
  ssl_enabled     INTEGER NOT NULL DEFAULT 0,
  ssl_ca          TEXT,
  ssl_cert        TEXT,
  ssl_key         TEXT,
  color           TEXT,             -- user-chosen accent color
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_local_only   INTEGER NOT NULL DEFAULT 0,  -- never synced to web profile
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ssh_tunnels (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  ssh_host        TEXT NOT NULL,
  ssh_port        INTEGER NOT NULL DEFAULT 22,
  ssh_user        TEXT NOT NULL,
  auth_method     TEXT NOT NULL CHECK (auth_method IN ('password','key')),
  -- encrypted the same way as connection passwords
  ssh_password_enc BLOB,
  ssh_password_iv  BLOB,
  private_key_path TEXT,
  passphrase_enc  BLOB,
  passphrase_iv   BLOB,
  local_port      INTEGER,          -- auto-assigned if NULL
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 2. FAVORITES & TAGS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  color           TEXT,             -- hex colour
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connection_tags (
  connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (connection_id, tag_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  label           TEXT,
  pinned_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 3. SNIPPETS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS snippets (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  sql_text        TEXT NOT NULL,
  language        TEXT NOT NULL DEFAULT 'sql',
  connection_id   TEXT REFERENCES connections(id) ON DELETE SET NULL,
  tags            TEXT,               -- JSON array of tag ids
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 4. MASTER PASSWORD VAULT ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),  -- single-row
  kdf_salt        BLOB NOT NULL,      -- PBKDF2 / Argon2 salt
  kdf_iterations  INTEGER NOT NULL DEFAULT 600000,
  verify_hash     TEXT NOT NULL,       -- SHA-256 of derived key (for unlock check)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 5. TIME-TRAVEL QUERY LOG ──────────────────────────────────────────────

-- Schema snapshots capture the DDL at the moment a query was run
CREATE TABLE IF NOT EXISTS schema_snapshots (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  database_name   TEXT NOT NULL,
  snapshot_json   TEXT NOT NULL,       -- full schema as JSON (tables, columns, indexes)
  checksum        TEXT NOT NULL,       -- SHA-256 of snapshot_json for dedup
  captured_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_snapshots_dedup
  ON schema_snapshots(connection_id, database_name, checksum);

CREATE TABLE IF NOT EXISTS query_snapshots (
  id              TEXT PRIMARY KEY,
  connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  database_name   TEXT NOT NULL,
  sql_text        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success','error')),
  error_message   TEXT,
  execution_time_ms INTEGER NOT NULL,
  row_count       INTEGER NOT NULL DEFAULT 0,
  result_sample   TEXT,               -- first N rows as JSON for quick preview
  schema_snapshot_id TEXT REFERENCES schema_snapshots(id) ON DELETE SET NULL,
  executed_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_query_snapshots_conn
  ON query_snapshots(connection_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_snapshots_fts
  ON query_snapshots(sql_text);

-- ── 6. WORKSPACE RECOVERY ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_recovery (
  id              TEXT PRIMARY KEY,    -- matches the tab id
  tab_title       TEXT NOT NULL,
  connection_id   TEXT,
  content         TEXT NOT NULL,       -- latest editor buffer
  cursor_line     INTEGER,
  cursor_column   INTEGER,
  scroll_top      REAL,
  is_dirty        INTEGER NOT NULL DEFAULT 1,
  saved_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 7. UI STATE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ui_state (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,       -- JSON-encoded value
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed common UI state keys
INSERT OR IGNORE INTO ui_state (key, value) VALUES
  ('theme', '"dark"'),
  ('sidebar_open', 'true'),
  ('sidebar_width', '260'),
  ('active_sidebar_tab', '"explorer"'),
  ('bottom_panel_visible', 'true'),
  ('active_bottom_tab', '"results"'),
  ('window_bounds', '{}');
