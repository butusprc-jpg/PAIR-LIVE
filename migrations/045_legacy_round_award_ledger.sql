-- Preserve the existing LEGACY points path while recording each award atomically.
CREATE TABLE round_legacy_award_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_id uuid NOT NULL UNIQUE REFERENCES round_entries(id) ON DELETE RESTRICT,
 round_id bigint NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 points bigint NOT NULL CHECK (points>0),
 balance_before bigint NOT NULL CHECK (balance_before>=0),
 balance_after bigint NOT NULL CHECK (balance_after=balance_before+points),
 actor uuid NOT NULL REFERENCES admin_identities(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION forbid_round_legacy_award_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'round_legacy_award_immutable'; END$$;
CREATE TRIGGER round_legacy_award_immutable BEFORE UPDATE OR DELETE ON round_legacy_award_ledger FOR EACH ROW EXECUTE FUNCTION forbid_round_legacy_award_mutation();
ALTER TABLE round_settlement_awards ALTER COLUMN wallet_ledger_id DROP NOT NULL;
ALTER TABLE round_settlement_awards ADD COLUMN legacy_ledger_id uuid UNIQUE REFERENCES round_legacy_award_ledger(id) ON DELETE RESTRICT;
ALTER TABLE round_settlement_awards ADD CONSTRAINT award_one_ledger CHECK ((wallet_ledger_id IS NOT NULL)<>(legacy_ledger_id IS NOT NULL));
REVOKE ALL ON round_legacy_award_ledger FROM PUBLIC;
