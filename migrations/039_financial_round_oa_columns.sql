-- Existing rows remain NULL: no tenant is inferred from a display name, amount,
-- member identity, or historical global configuration.
ALTER TABLE rounds ADD COLUMN oa_id uuid REFERENCES oa_service_control(id);
ALTER TABLE member_topup_requests ADD COLUMN oa_id uuid REFERENCES oa_service_control(id);
ALTER TABLE member_withdrawal_requests ADD COLUMN oa_id uuid REFERENCES oa_service_control(id);
CREATE INDEX rounds_oa_epoch_idx ON rounds(oa_id,epoch_id,id DESC) WHERE oa_id IS NOT NULL;
CREATE INDEX member_topup_oa_created_idx ON member_topup_requests(oa_id,created_at DESC) WHERE oa_id IS NOT NULL;
CREATE INDEX member_withdrawal_oa_created_idx ON member_withdrawal_requests(oa_id,created_at DESC) WHERE oa_id IS NOT NULL;
CREATE FUNCTION forbid_oa_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.oa_id IS DISTINCT FROM OLD.oa_id THEN RAISE EXCEPTION 'oa_binding_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER round_oa_immutable BEFORE UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION forbid_oa_reassignment();
CREATE TRIGGER topup_oa_immutable BEFORE UPDATE ON member_topup_requests FOR EACH ROW EXECUTE FUNCTION forbid_oa_reassignment();
CREATE TRIGGER withdrawal_oa_immutable BEFORE UPDATE ON member_withdrawal_requests FOR EACH ROW EXECUTE FUNCTION forbid_oa_reassignment();
