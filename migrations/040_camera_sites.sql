-- V15: one site per OA; rounds remain on the existing single-site engine.
CREATE TABLE camera_sites (
 site_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 oa_id uuid NOT NULL UNIQUE REFERENCES oa_service_control(id),
 name text NOT NULL DEFAULT 'PAIR LIVE' CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 country text NOT NULL DEFAULT 'Thailand' CHECK (length(btrim(country)) BETWEEN 1 AND 80),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text,
 UNIQUE(site_id,oa_id)
);
CREATE TABLE site_cameras (
 camera_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL,
 oa_id uuid NOT NULL,
 slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 source_kind text NOT NULL DEFAULT 'VDO_NINJA' CHECK (source_kind IN ('VDO_NINJA','RTSP_GATEWAY','IP_CAMERA')),
 stream_id text CHECK (stream_id IS NULL OR stream_id ~ '^[A-Za-z0-9_-]{7,64}$'),
 display_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text,
 FOREIGN KEY(site_id,oa_id) REFERENCES camera_sites(site_id,oa_id),
 UNIQUE(oa_id,slot),
 UNIQUE(oa_id,camera_id),
 CHECK (source_kind='VDO_NINJA' OR stream_id IS NULL),
 CHECK (NOT display_enabled OR source_kind='VDO_NINJA' AND stream_id IS NOT NULL)
);
CREATE INDEX site_cameras_visible_idx ON site_cameras(oa_id,slot) WHERE display_enabled;
CREATE FUNCTION camera_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF to_jsonb(NEW)->>'oa_id' IS DISTINCT FROM to_jsonb(OLD)->>'oa_id'
    OR to_jsonb(NEW)->>'site_id' IS DISTINCT FROM to_jsonb(OLD)->>'site_id'
    OR to_jsonb(NEW)->>'camera_id' IS DISTINCT FROM to_jsonb(OLD)->>'camera_id'
    OR to_jsonb(NEW)->>'slot' IS DISTINCT FROM to_jsonb(OLD)->>'slot' THEN
  RAISE EXCEPTION 'camera_identity_immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER camera_site_identity BEFORE UPDATE ON camera_sites FOR EACH ROW EXECUTE FUNCTION camera_identity_immutable();
CREATE TRIGGER camera_slot_identity BEFORE UPDATE ON site_cameras FOR EACH ROW EXECUTE FUNCTION camera_identity_immutable();
INSERT INTO camera_sites(oa_id,name)
 SELECT v.oa_id,left(o.shop_name,80) FROM vdo_ninja_tenants v JOIN oa_service_control o ON o.id=v.oa_id;
INSERT INTO site_cameras(site_id,oa_id,slot,name,stream_id,display_enabled)
 SELECT s.site_id,s.oa_id,1,'กล้องหลัก',v.stream_id,v.display_enabled
 FROM camera_sites s JOIN vdo_ninja_tenants v ON v.oa_id=s.oa_id;
ALTER TABLE camera_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE camera_sites FORCE ROW LEVEL SECURITY;
CREATE POLICY camera_sites_bound ON camera_sites
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
ALTER TABLE site_cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_cameras FORCE ROW LEVEL SECURITY;
CREATE POLICY site_cameras_bound ON site_cameras
 USING (external_live_is_bound(oa_id)) WITH CHECK (external_live_is_bound(oa_id));
REVOKE ALL ON camera_sites,site_cameras FROM PUBLIC;
-- Future site-specific rounds only. Existing rounds stay NULL; no historical OA/site is inferred.
ALTER TABLE rounds ADD COLUMN site_id uuid REFERENCES camera_sites(site_id);
CREATE INDEX rounds_site_id_idx ON rounds(site_id) WHERE site_id IS NOT NULL;
