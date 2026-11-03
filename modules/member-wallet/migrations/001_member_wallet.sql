-- Apply to PAIR LIVE only after migrations/001_members.sql and 002_round_engine.sql.
-- The wallet starts DISABLED: Core still debits members.demo_points. A reviewed,
-- transactional cutover must reconcile/backfill and disable that old debit path.
BEGIN;

CREATE TABLE member_wallet_runtime_state (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 cutover_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL DEFAULT 'migration',
 CHECK (enabled=false OR cutover_at IS NOT NULL)
);
INSERT INTO member_wallet_runtime_state(id) VALUES (1);

CREATE TABLE member_wallets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL UNIQUE REFERENCES members(id) ON DELETE RESTRICT,
 available_points bigint NOT NULL DEFAULT 0 CHECK (available_points>=0),
 reserved_points bigint NOT NULL DEFAULT 0 CHECK (reserved_points>=0),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','FROZEN')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_wallets_member_status_idx ON member_wallets(member_id,status);

CREATE TABLE member_wallet_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 wallet_id uuid NOT NULL REFERENCES member_wallets(id) ON DELETE RESTRICT,
 type text NOT NULL CHECK (type IN ('DEMO_GRANT','DEMO_USE','DEMO_REFUND','DEMO_ADJUSTMENT')),
 points bigint NOT NULL CHECK ((type='DEMO_ADJUSTMENT' AND points<>0) OR (type<>'DEMO_ADJUSTMENT' AND points>0)),
 balance_before bigint NOT NULL CHECK (balance_before>=0),
 balance_after bigint NOT NULL CHECK (balance_after>=0),
 reference_id text NOT NULL CHECK (length(reference_id)>0),
 idempotency_key text NOT NULL CHECK (length(idempotency_key)>0),
 audit_actor text NOT NULL,
 audit_source text NOT NULL CHECK (audit_source IN ('admin','round','internal')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(member_id,idempotency_key),
 CHECK ((type='DEMO_USE' AND balance_after=balance_before-points)
     OR (type IN ('DEMO_GRANT','DEMO_REFUND','DEMO_ADJUSTMENT') AND balance_after=balance_before+points))
);
CREATE INDEX member_wallet_ledger_owner_time_idx ON member_wallet_ledger(member_id,created_at DESC,id DESC);
CREATE INDEX member_wallet_ledger_reference_idx ON member_wallet_ledger(reference_id);

CREATE TABLE member_wallet_audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 wallet_id uuid NOT NULL REFERENCES member_wallets(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 ledger_id uuid REFERENCES member_wallet_ledger(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('CREATED','MUTATION','CUTOVER')),
 actor text NOT NULL,
 source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_wallet_audit_member_time_idx ON member_wallet_audit_logs(member_id,created_at DESC);

CREATE FUNCTION member_wallet_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'member_wallet_ledger_is_immutable'; END;
$$;
CREATE TRIGGER member_wallet_ledger_no_update_delete BEFORE UPDATE OR DELETE ON member_wallet_ledger
FOR EACH ROW EXECUTE FUNCTION member_wallet_ledger_immutable();

REVOKE ALL ON member_wallet_runtime_state,member_wallets,member_wallet_ledger,member_wallet_audit_logs FROM PUBLIC;
REVOKE ALL ON SEQUENCE member_wallet_audit_logs_id_seq FROM PUBLIC;
ALTER TABLE member_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_wallets FORCE ROW LEVEL SECURITY;
CREATE POLICY member_wallets_owner ON member_wallets USING (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid)
WITH CHECK (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid);
ALTER TABLE member_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_wallet_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY member_wallet_ledger_owner ON member_wallet_ledger USING (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid)
WITH CHECK (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid);
ALTER TABLE member_wallet_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_wallet_audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY member_wallet_audit_owner ON member_wallet_audit_logs USING (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid)
WITH CHECK (member_id=NULLIF(current_setting('pair_live.member_id',true),'')::uuid);
COMMIT;

-- Grant a private server role narrowly scoped table/sequence privileges. Never
-- expose that role to a browser. Only a migration/cutover role may UPDATE the
-- singleton state; the runtime needs SELECT. Backfill each member's legacy
-- balance and opening ledger entry under a controlled cutover transaction.
-- Do not enable until Round Engine uses the wallet ledger in that same round
-- entry transaction and legacy members.demo_points is no longer debited.
