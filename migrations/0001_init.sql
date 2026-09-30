-- 사용자 (구글 계정 이메일 기준)
CREATE TABLE users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'pending',   -- admin | staff | viewer | pending | blocked
  dept TEXT NOT NULL DEFAULT '',
  picture TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_email ON sessions(email);

-- 모든 업무 기록 (모듈별 규격은 public/js/modules.js)
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  year INTEGER,          -- scope=year 인 모듈
  date TEXT,             -- scope=date 인 모듈 (YYYY-MM-DD)
  sort INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,    -- JSON
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_records_module_date ON records(module, date);
CREATE INDEX idx_records_module_year ON records(module, year);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 변경 기록 (누가 언제 무엇을)
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  email TEXT,
  action TEXT NOT NULL,
  module TEXT,
  record_id TEXT,
  detail TEXT
);
CREATE INDEX idx_audit_at ON audit(at);
