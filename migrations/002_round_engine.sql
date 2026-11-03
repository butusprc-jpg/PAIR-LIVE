-- Apply after 001_members.sql. All timestamps are timestamptz (UTC in storage).
CREATE TABLE round_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 duration_minutes integer NOT NULL DEFAULT 5 CHECK (duration_minutes BETWEEN 1 AND 60),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO round_settings(id,duration_minutes) VALUES(1,5);
CREATE TABLE rounds (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 round_date date NOT NULL,
 opens_at timestamptz NOT NULL,
 closes_at timestamptz NOT NULL,
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 60),
 status text NOT NULL CHECK (status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED','SETTLED','CANCELLED')),
 closed_at timestamptz,
 settled_at timestamptz,
 result_number text,
 even_people integer NOT NULL DEFAULT 0 CHECK (even_people >= 0),
 even_points bigint NOT NULL DEFAULT 0 CHECK (even_points >= 0),
 odd_people integer NOT NULL DEFAULT 0 CHECK (odd_people >= 0),
 odd_points bigint NOT NULL DEFAULT 0 CHECK (odd_points >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (closes_at = opens_at + duration_minutes * interval '1 minute'),
 CHECK (result_number IS NULL OR result_number ~ '^[0-9]+$')
);
CREATE UNIQUE INDEX rounds_one_unfinished ON rounds ((1)) WHERE status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED');
CREATE INDEX rounds_date_open_idx ON rounds(round_date,opens_at DESC);
CREATE TABLE round_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round_id bigint NOT NULL REFERENCES rounds(id),
 member_id uuid NOT NULL REFERENCES members(id),
 side text NOT NULL CHECK (side IN ('even','odd')),
 demo_points integer NOT NULL CHECK (demo_points BETWEEN 1 AND 1000000),
 idempotency_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CORRECT','INCORRECT','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(member_id,idempotency_key)
);
CREATE INDEX round_entries_round_side_idx ON round_entries(round_id,side);
CREATE INDEX round_entries_member_time_idx ON round_entries(member_id,created_at DESC);
CREATE TABLE round_audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 round_id bigint REFERENCES rounds(id),
 actor text NOT NULL,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_audit_logs_round_time_idx ON round_audit_logs(round_id,created_at DESC);
REVOKE ALL ON round_settings,rounds,round_entries,round_audit_logs FROM PUBLIC;
ALTER TABLE round_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY round_entries_owner ON round_entries
 USING (member_id = NULLIF(current_setting('pair_live.member_id',true),'')::uuid)
 WITH CHECK (member_id = NULLIF(current_setting('pair_live.member_id',true),'')::uuid);
ALTER TABLE members ALTER COLUMN demo_points SET DEFAULT 1250;
-- No points settlement, result generation, or camera evidence is created by this migration.
