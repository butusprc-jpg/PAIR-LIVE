-- Additive preference for per-recipient LINE messages. Existing members remain Thai.
ALTER TABLE members ADD COLUMN notification_locale text NOT NULL DEFAULT 'th'
 CHECK (notification_locale IN ('th','zh-CN','en'));
ALTER TABLE members ADD COLUMN notification_locale_source text NOT NULL DEFAULT 'default'
 CHECK (notification_locale_source IN ('default','choice'));
-- The application member session scopes updates by member ID; no browser database role is granted.
