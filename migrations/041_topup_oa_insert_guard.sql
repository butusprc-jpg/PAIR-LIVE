-- Bind new requests from verified member identity rows. Historical requests are
-- left untouched. Ambiguous member identities fail closed.
CREATE FUNCTION bind_new_topup_oa() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE candidate uuid; matches integer;
BEGIN
 SELECT count(DISTINCT c.oa_id),min(c.oa_id::text)::uuid INTO matches,candidate
 FROM oa_credentials c JOIN member_identities i ON i.provider='line' AND i.provider_channel_id=c.login_channel_id
 WHERE i.member_id=NEW.member_id;
 IF matches>1 THEN RAISE EXCEPTION 'oa_member_ambiguous' USING ERRCODE='42501'; END IF;
 IF matches=0 THEN
  IF NEW.oa_id IS NOT NULL THEN RAISE EXCEPTION 'oa_member_mismatch' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.oa_id IS NOT NULL AND NEW.oa_id<>candidate THEN RAISE EXCEPTION 'oa_member_mismatch' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM member_identities i WHERE i.member_id=NEW.member_id
    AND (i.provider<>'line' OR i.provider_channel_id<>(SELECT login_channel_id FROM oa_credentials WHERE oa_id=candidate)))
 OR NOT EXISTS(SELECT 1 FROM oa_service_control o WHERE o.id=candidate AND o.enabled=true AND o.paused=false AND o.deleted_at IS NULL AND o.expires_at>now())
 THEN RAISE EXCEPTION 'oa_member_inactive' USING ERRCODE='42501'; END IF;
 NEW.oa_id:=candidate;
 RETURN NEW;
END $$;
CREATE TRIGGER topup_bind_oa BEFORE INSERT ON member_topup_requests FOR EACH ROW EXECUTE FUNCTION bind_new_topup_oa();
