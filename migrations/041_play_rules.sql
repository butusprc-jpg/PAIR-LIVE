-- Rules are scoped to the verified connected OA. No member, wallet, or ledger data changes.
CREATE TABLE play_rules (
 oa_id uuid PRIMARY KEY REFERENCES oa_service_control(id),
 content text NOT NULL DEFAULT '' CHECK (length(content) <= 10000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by text
);
REVOKE ALL ON play_rules FROM PUBLIC;
