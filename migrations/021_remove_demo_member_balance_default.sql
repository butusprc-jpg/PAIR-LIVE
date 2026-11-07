-- New members start without an unearned point balance. Existing balances are
-- intentionally untouched; their provenance requires a separate audit.
ALTER TABLE members ALTER COLUMN demo_points SET DEFAULT 0;
