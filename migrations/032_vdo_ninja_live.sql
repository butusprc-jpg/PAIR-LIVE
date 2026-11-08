-- VDO.Ninja display visibility; publisher presence is verified by the viewer, not this flag.
ALTER TABLE external_live_settings ADD COLUMN vdo_display_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE external_live_settings ADD COLUMN vdo_revision bigint NOT NULL DEFAULT 0 CHECK (vdo_revision >= 0);
