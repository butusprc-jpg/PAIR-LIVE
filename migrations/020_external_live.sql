-- External embed visibility is independent from round timing and results.
CREATE TABLE external_live_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 embed_url text,
 provider text CHECK (provider IN ('youtube','vimeo')),
 status text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('OFFLINE','READY','LIVE')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL DEFAULT 'migration',
 CHECK ((embed_url IS NULL)=(provider IS NULL)),
 CHECK (status <> 'LIVE' OR embed_url IS NOT NULL)
);
INSERT INTO external_live_settings(id) VALUES(1);
REVOKE ALL ON external_live_settings FROM PUBLIC;
