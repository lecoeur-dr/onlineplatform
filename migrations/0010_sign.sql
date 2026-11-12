-- ✍️ 회의록 전자서명 (인사자문위원회 등): 위원별 링크·6자리 비밀번호로 확인·서명
--   일반 기록(records)과 따로 두어 비밀번호 해시·서명 이미지가 목록 API로 나가지 않게 함
CREATE TABLE sign_meetings (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  data TEXT NOT NULL,                  -- { title, datetime, place, committee, agenda, result, confirmDate, school }
  status TEXT NOT NULL DEFAULT 'open', -- open(서명 받는 중) | closed(마감)
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sign_meetings_school ON sign_meetings(school_id, year);

CREATE TABLE sign_members (
  meeting_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT '',       -- 위원장·위원·간사
  position TEXT NOT NULL DEFAULT '',   -- 교감·교사 등
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,           -- 짧은 링크 코드
  signed_at TEXT,
  signature TEXT,                      -- 서명 이미지(암호화)
  doc_hash TEXT,                       -- 서명할 때의 회의록 지문
  fail_count INTEGER NOT NULL DEFAULT 0,
  device TEXT,
  PRIMARY KEY (meeting_id, member_id)
);

CREATE TABLE sign_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,
  member_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sign_log_meeting ON sign_log(meeting_id);

-- 위변조 확인 기록: 회의록을 파기해도 남김 (파일 확인값·제목·날짜·서명자 이름과 시각)
CREATE TABLE sign_pdfs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  name TEXT,
  sha256 TEXT NOT NULL,
  doc_hash TEXT,
  title TEXT,
  school TEXT,
  confirm_date TEXT,
  signers TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sign_pdfs_sha ON sign_pdfs(sha256);
