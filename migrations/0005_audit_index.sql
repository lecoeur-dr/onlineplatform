-- 변경 기록을 학교별·아이디별로 빠르게 거르기 위한 색인
CREATE INDEX IF NOT EXISTS idx_audit_school ON audit(school_id, id);
CREATE INDEX IF NOT EXISTS idx_audit_school_email ON audit(school_id, email, id);
