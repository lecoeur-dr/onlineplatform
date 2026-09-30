-- 여러 사람이 같은 기록을 동시에 고칠 때 덮어쓰기 방지용 버전 번호
ALTER TABLE records ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
