-- A failed BEFORE UPDATE aborts decideTopup's entire transaction, including
-- its preceding balance and audit writes. Legacy NULL OA rows retain behavior.
CREATE FUNCTION enforce_topup_oa_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE decision_admin uuid;
BEGIN
 IF OLD.oa_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 decision_admin := CASE WHEN NEW.status='APPROVED' THEN NEW.approved_by
                        WHEN NEW.status='REJECTED' THEN NEW.rejected_by ELSE NULL END;
 IF decision_admin IS NULL OR NOT EXISTS (
  SELECT 1 FROM oa_service_control o
  JOIN oa_credentials c ON c.oa_id=o.id
  JOIN member_identities mi ON mi.member_id=OLD.member_id AND mi.provider='line' AND mi.provider_channel_id=c.login_channel_id
  JOIN admin_identities ai ON ai.id=decision_admin AND ai.provider='line' AND ai.provider_channel_id=c.login_channel_id
  WHERE o.id=OLD.oa_id AND o.enabled=true AND o.paused=false AND o.deleted_at IS NULL AND o.expires_at>now()
    AND ai.status='active' AND ai.role='admin'
    AND NOT EXISTS (SELECT 1 FROM member_identities other_identity WHERE other_identity.member_id=OLD.member_id
      AND (other_identity.provider<>'line' OR other_identity.provider_channel_id<>c.login_channel_id))
 ) THEN RAISE EXCEPTION 'oa_decision_forbidden' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER topup_oa_decision_guard BEFORE UPDATE OF status ON member_topup_requests
 FOR EACH ROW EXECUTE FUNCTION enforce_topup_oa_decision();
