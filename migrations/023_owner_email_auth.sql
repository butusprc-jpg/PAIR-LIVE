-- Owner email credentials are provisioned out of band. No default password or demo owner.
CREATE TABLE owner_email_accounts (
 email text PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 5 AND 254),
 password_salt text NOT NULL,
 password_hash text NOT NULL,
 must_change_password boolean NOT NULL DEFAULT true,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON owner_email_accounts FROM PUBLIC;
