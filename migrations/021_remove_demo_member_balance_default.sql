-- New members start with zero points. Existing balances are untouched.
ALTER TABLE members ALTER COLUMN demo_points SET DEFAULT 0;
