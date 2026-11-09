-- Remote API key is encrypted by the application before storage. Existing stream IDs stay unchanged.
ALTER TABLE vdo_ninja_tenants ADD COLUMN remote_key_ciphertext text;
ALTER TABLE vdo_ninja_audit DROP CONSTRAINT vdo_ninja_audit_action_check;
ALTER TABLE vdo_ninja_audit ADD CONSTRAINT vdo_ninja_audit_action_check
 CHECK (action IN ('CONNECT','START','STOP'));
