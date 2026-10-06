-- 학교 가입·개설 신청 때 남기는 메모 (예: "춘천 춘천초등학교입니다.")
ALTER TABLE members ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN note TEXT NOT NULL DEFAULT '';
