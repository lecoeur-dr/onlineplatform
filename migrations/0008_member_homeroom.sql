-- 관리자가 지정하는 담임 학급(예: 3-1) 또는 전담(예: 과학 전담): 시간표 탭이 내 시간표로 바로 열림
ALTER TABLE members ADD COLUMN homeroom TEXT NOT NULL DEFAULT '';
