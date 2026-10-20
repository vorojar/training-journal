CREATE TABLE spaces(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL UNIQUE REFERENCES user(id),name TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE documents(space_id TEXT PRIMARY KEY REFERENCES spaces(id),payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,actor_id TEXT NOT NULL REFERENCES user(id),mutation_id TEXT NOT NULL,mutation_hash TEXT NOT NULL,action TEXT NOT NULL,updated_at TEXT NOT NULL,legacy TEXT NOT NULL DEFAULT '[]');
CREATE TABLE changes(space_id TEXT NOT NULL REFERENCES spaces(id),mutation_id TEXT NOT NULL,mutation_hash TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES user(id),version INTEGER NOT NULL,payload TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(space_id,mutation_id));
CREATE INDEX changes_space_date ON changes(space_id,created_at DESC);
CREATE TABLE members(space_id TEXT NOT NULL REFERENCES spaces(id),user_id TEXT NOT NULL REFERENCES user(id),status TEXT NOT NULL CHECK(status IN ('pending','active','revoked')),created_at TEXT NOT NULL,PRIMARY KEY(space_id,user_id));
CREATE INDEX members_user ON members(user_id,status);
CREATE TABLE invites(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),token_hash TEXT NOT NULL UNIQUE,email TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,used_by TEXT REFERENCES user(id));
CREATE INDEX invites_space ON invites(space_id,created_at);
CREATE TABLE access_log(id TEXT PRIMARY KEY,space_id TEXT NOT NULL,actor_id TEXT NOT NULL,target_id TEXT,action TEXT NOT NULL,created_at TEXT NOT NULL);
