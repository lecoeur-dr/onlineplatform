-- 🍚 급식 의견: 학생 응답 (로그인 없음 · 이름 없음 · 학년만). 기기마다 1건, 다시 내면 덮어씀
CREATE TABLE IF NOT EXISTS meal_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id TEXT NOT NULL,
  poll_id TEXT NOT NULL,
  device TEXT NOT NULL,
  grade INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL DEFAULT '{}',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (poll_id, device)
);
CREATE INDEX IF NOT EXISTS idx_meal_responses_poll ON meal_responses(poll_id);
