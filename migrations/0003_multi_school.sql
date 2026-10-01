-- 여러 학교가 함께 쓰는 구조 + 개인 공간(Deskterior) + 알림
--   기존 데이터는 모두 첫 학교(s1)로 옮김

CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- active | pending(운영자 승인 대기) | closed
  invite_code TEXT UNIQUE,
  neis_code TEXT,                           -- 나이스 학교 코드 (같은 학교 중복 개설 방지 참고용)
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 학교별 구성원: 권한은 학교마다 따로
CREATE TABLE members (
  school_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pending',     -- admin | staff | viewer | pending | blocked
  name TEXT NOT NULL DEFAULT '',
  dept TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (school_id, email)
);
CREATE INDEX idx_members_email ON members(email);

CREATE TABLE school_settings (
  school_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (school_id, key)
);

-- 기록: 학교 기록은 school_id, 개인 기록(Deskterior)은 owner
ALTER TABLE records ADD COLUMN school_id TEXT;
ALTER TABLE records ADD COLUMN owner TEXT;
CREATE INDEX idx_records_school ON records(school_id, module, date);
CREATE INDEX idx_records_owner ON records(owner, module);
ALTER TABLE audit ADD COLUMN school_id TEXT;

-- 알림함 + 휴대폰 알림(웹 푸시) 구독
CREATE TABLE inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  school_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inbox_email ON inbox(email, id);

CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_email ON push_subs(email);

-- ---------- 기존 데이터 → 첫 학교 ----------
INSERT INTO schools (id, name, status, invite_code, created_by)
VALUES ('s1', COALESCE((SELECT json_extract(value, '$') FROM settings WHERE key = 'schoolName'), '우리 학교'), 'active', lower(hex(randomblob(4))), NULL);

INSERT INTO members (school_id, email, role, name, dept, created_at)
SELECT 's1', email, role, name, dept, created_at FROM users;

INSERT INTO school_settings (school_id, key, value) SELECT 's1', key, value FROM settings;

UPDATE records SET school_id = 's1';
UPDATE audit SET school_id = 's1';
