-- Settlement remains closed until a verified result, explicit rate and active wallet exist.
ALTER TABLE rounds ADD COLUMN settlement_oa_id uuid REFERENCES oa_service_control(id) ON DELETE RESTRICT;
CREATE FUNCTION forbid_round_settlement_oa_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF NEW.settlement_oa_id IS DISTINCT FROM OLD.settlement_oa_id THEN RAISE EXCEPTION 'round_settlement_oa_immutable'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER round_settlement_oa_immutable BEFORE UPDATE OF settlement_oa_id ON rounds FOR EACH ROW EXECUTE FUNCTION forbid_round_settlement_oa_change();
CREATE TABLE round_settlement_config (
 round_id bigint PRIMARY KEY REFERENCES rounds(id) ON DELETE RESTRICT,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id) ON DELETE RESTRICT,
 rate_numerator integer NOT NULL CHECK (rate_numerator>0),
 rate_denominator integer NOT NULL CHECK (rate_denominator>0),
 configured_by uuid NOT NULL REFERENCES admin_identities(id),
 configured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE round_settlement_awards (
 entry_id uuid PRIMARY KEY REFERENCES round_entries(id) ON DELETE RESTRICT,
 round_id bigint NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
 member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 credited_points bigint NOT NULL CHECK (credited_points>0),
 wallet_ledger_id uuid NOT NULL UNIQUE REFERENCES member_wallet_ledger(id) ON DELETE RESTRICT,
 credited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_settlement_awards_round_idx ON round_settlement_awards(round_id,member_id);
CREATE FUNCTION forbid_round_settlement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'round_settlement_immutable'; END$$;
CREATE TRIGGER round_settlement_config_immutable BEFORE UPDATE OR DELETE ON round_settlement_config FOR EACH ROW EXECUTE FUNCTION forbid_round_settlement_mutation();
CREATE TRIGGER round_settlement_awards_immutable BEFORE UPDATE OR DELETE ON round_settlement_awards FOR EACH ROW EXECUTE FUNCTION forbid_round_settlement_mutation();
REVOKE ALL ON round_settlement_config,round_settlement_awards FROM PUBLIC;
