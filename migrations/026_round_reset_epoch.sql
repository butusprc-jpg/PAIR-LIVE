-- Archive round data by epoch. No historical round, entry, evidence, ledger,
-- broadcast or audit row is deleted or modified by a reset.
CREATE TABLE round_reset_epochs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reset_key uuid UNIQUE,
 created_by uuid REFERENCES admin_identities(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_rounds bigint NOT NULL DEFAULT 0 CHECK (archived_rounds >= 0),
 archived_entries bigint NOT NULL DEFAULT 0 CHECK (archived_entries >= 0)
);
INSERT INTO round_reset_epochs(created_at) VALUES('1970-01-01T00:00:00Z');

CREATE FUNCTION current_round_epoch_id() RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT max(id) FROM round_reset_epochs
$$;

ALTER TABLE rounds ADD COLUMN epoch_id bigint REFERENCES round_reset_epochs(id);
UPDATE rounds SET epoch_id=1;
ALTER TABLE rounds ALTER COLUMN epoch_id SET DEFAULT current_round_epoch_id();
ALTER TABLE rounds ALTER COLUMN epoch_id SET NOT NULL;
CREATE INDEX rounds_epoch_open_idx ON rounds(epoch_id,opens_at DESC,id DESC);
DROP INDEX rounds_one_unfinished;
CREATE UNIQUE INDEX rounds_one_unfinished_epoch ON rounds(epoch_id)
 WHERE status IN ('OPEN','CLOSED','SCANNING','REVIEW_REQUIRED');

CREATE FUNCTION reject_archived_round_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.epoch_id <> current_round_epoch_id() THEN RAISE EXCEPTION 'archived_round_is_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.epoch_id <> current_round_epoch_id() THEN
  RAISE EXCEPTION 'archived_round_is_immutable';
 END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER archived_round_immutable BEFORE INSERT OR UPDATE OR DELETE ON rounds
 FOR EACH ROW EXECUTE FUNCTION reject_archived_round_mutation();

CREATE FUNCTION reject_archived_entry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS (SELECT 1 FROM rounds WHERE id=NEW.round_id AND epoch_id=current_round_epoch_id()) THEN RAISE EXCEPTION 'archived_round_entry_is_immutable'; END IF;
  RETURN NEW;
 END IF;
 IF EXISTS (SELECT 1 FROM rounds WHERE id=OLD.round_id AND epoch_id <> current_round_epoch_id()) THEN
  RAISE EXCEPTION 'archived_round_entry_is_immutable';
 END IF;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER archived_round_entry_immutable BEFORE INSERT OR UPDATE OR DELETE ON round_entries
 FOR EACH ROW EXECUTE FUNCTION reject_archived_entry_mutation();

REVOKE ALL ON round_reset_epochs FROM PUBLIC;
