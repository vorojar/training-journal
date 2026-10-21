CREATE TABLE plan_templates(user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,id));
CREATE INDEX plan_templates_user_date ON plan_templates(user_id,updated_at DESC);
CREATE INDEX changes_space_version ON changes(space_id,version);
