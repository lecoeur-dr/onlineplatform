-- 학생 제출(로그인 없이 링크로): 서·논술형 답안, 클래스 보드 글
--   활동(activities)은 records 의 Deskterior 기록(교사 본인), 제출물은 여기에 암호화해 저장
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id TEXT NOT NULL,
  owner TEXT NOT NULL,                 -- 활동을 만든 교사
  who TEXT NOT NULL DEFAULT '',        -- 같은 학생 답안 덮어쓰기용 해시(번호+이름)
  num TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',       -- 암호화
  body TEXT NOT NULL,                  -- 암호화
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sub_activity ON submissions(activity_id, id);
CREATE INDEX idx_sub_who ON submissions(activity_id, who);
