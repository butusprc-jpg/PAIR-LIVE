-- V13 extension: independent of V12 migrations 028/029. No financial tables changed.
CREATE TABLE owner_usage_daily (
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 usage_date date NOT NULL,
 member_count bigint CHECK(member_count>=0),
 round_count bigint CHECK(round_count>=0),
 api_requests bigint CHECK(api_requests>=0),
 line_messages_used bigint CHECK(line_messages_used>=0),
 line_quota bigint CHECK(line_quota>=0),
 source_status text NOT NULL CHECK(source_status IN ('LIVE','PARTIAL','UNAVAILABLE','ERROR')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(oa_id,usage_date)
);
CREATE INDEX owner_usage_daily_date_idx ON owner_usage_daily(usage_date DESC);
CREATE TABLE owner_usage_line_snapshots (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 quota_type text CHECK(quota_type IN ('limited','none')),
 quota bigint CHECK(quota>=0),
 used bigint CHECK(used>=0),
 fetch_status text NOT NULL CHECK(fetch_status IN ('OK','NOT_CONNECTED','ERROR')),
 fetched_at timestamptz,
 attempted_at timestamptz NOT NULL DEFAULT now(),
 error_code text CHECK(length(error_code)<=64)
);
CREATE TABLE owner_usage_alert_settings (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 enabled boolean NOT NULL DEFAULT true,
 threshold_70 boolean NOT NULL DEFAULT true,
 threshold_85 boolean NOT NULL DEFAULT true,
 threshold_95 boolean NOT NULL DEFAULT true,
 threshold_100 boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_usage_alert_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 actor_session_hash char(64) NOT NULL,
 before_settings jsonb,
 after_settings jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE owner_usage_api_batches (
 batch_id uuid PRIMARY KEY,
 oa_id uuid NOT NULL REFERENCES oa_service_control(id),
 usage_date date NOT NULL,
 request_count integer NOT NULL CHECK(request_count>0 AND request_count<=10000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_usage_api_batches_day_idx ON owner_usage_api_batches(oa_id,usage_date);
REVOKE ALL ON owner_usage_daily,owner_usage_line_snapshots,owner_usage_alert_settings,owner_usage_alert_audit,owner_usage_api_batches FROM PUBLIC;
REVOKE ALL ON SEQUENCE owner_usage_alert_audit_id_seq FROM PUBLIC;
-- Database owner alone can read/write; application routes still require ownerAccess.
ALTER TABLE owner_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_line_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_line_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_alert_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_alert_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_alert_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_api_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_usage_api_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_usage_daily_owner ON owner_usage_daily TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY owner_usage_line_owner ON owner_usage_line_snapshots TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY owner_usage_settings_owner ON owner_usage_alert_settings TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY owner_usage_audit_owner ON owner_usage_alert_audit TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY owner_usage_batches_owner ON owner_usage_api_batches TO CURRENT_USER USING(true) WITH CHECK(true);
