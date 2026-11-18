-- One shared counter per authenticated actor and transaction endpoint.
CREATE TABLE transaction_rate_limits (
 scope text NOT NULL CHECK (scope IN ('round_entry','member_topup','member_withdrawal','admin_topup_decision')),
 actor_id uuid NOT NULL,
 window_start timestamptz NOT NULL,
 request_count integer NOT NULL CHECK (request_count > 0),
 PRIMARY KEY (scope,actor_id)
);
REVOKE ALL ON transaction_rate_limits FROM PUBLIC;
