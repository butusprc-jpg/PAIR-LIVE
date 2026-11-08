import test from 'node:test';import assert from 'node:assert/strict';import {migrationManifest,assertTestTarget,migrationPaths,assertMigrationOrder} from '../lib/migration-manifest';
test('migration manifest is ordered, complete and SHA-256 hashed',async()=>{const entries=await migrationManifest();assert.equal(entries.length,31);assert.deepEqual(entries.map(e=>e.path),[...migrationPaths]);assert.ok(entries.every(e=>/^[0-9a-f]{64}$/.test(e.sha256)))});
test('migration runner rejects Neon and production targets',()=>{assert.throws(()=>assertTestTarget('postgresql://u:p@neon.tech/pair-live-db'),/test_target_guard_rejected/);assert.throws(()=>assertTestTarget('postgresql://u:p@127.0.0.1/pair-live-db'),/test_target_guard_rejected/);assert.equal(assertTestTarget('postgresql://u:p@127.0.0.1/pair_live_migration_test'),'postgresql://u:p@127.0.0.1/pair_live_migration_test')});

test('migration 021 removes only the new-member point default',async()=>{const entries=await migrationManifest();const sql=entries.find(e=>e.path==='migrations/021_remove_demo_member_balance_default.sql')?.sql;assert.match(sql||'',/ALTER TABLE members ALTER COLUMN demo_points SET DEFAULT 0;/);assert.doesNotMatch(sql||'',/\bUPDATE\s+members\b/i)});

test('V13 extension accepts V12 028/029 arriving later only',()=>{
 const ordered=['migrations/027_round_reset_rls_access.sql','migrations/028_v12.sql','migrations/029_v12.sql','migrations/030_owner_usage_metrics.sql'];
 assert.doesNotThrow(()=>assertMigrationOrder(ordered,new Set([ordered[0],ordered[3]])));
 assert.throws(()=>assertMigrationOrder(ordered,new Set([ordered[0],'migrations/029_v12.sql'])),/migration_order_gap/);
 assert.throws(()=>assertMigrationOrder([...ordered.slice(0,1),'migrations/020_missing.sql',ordered[3]],new Set([ordered[0],ordered[3]])),/migration_order_gap/);
});
