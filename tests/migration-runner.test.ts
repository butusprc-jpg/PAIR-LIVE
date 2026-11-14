import test from 'node:test';import assert from 'node:assert/strict';import {migrationManifest,assertTestTarget,migrationPaths,assertMigrationOrder,assertUniqueMigrationNumbers,assertNoLegacyV13History} from '../lib/migration-manifest';
test('migration manifest is ordered, complete and SHA-256 hashed',async()=>{const entries=await migrationManifest();assert.equal(entries.length,46);assert.deepEqual(entries.map(e=>e.path),[...migrationPaths]);assert.ok(entries.findIndex(e=>e.path==='migrations/027_round_reset_rls_access.sql')<entries.findIndex(e=>e.path==='migrations/028_external_live_tenants.sql'));assert.equal(entries.at(-1)?.path,'migrations/046_camera_ocr_roi.sql');assert.ok(entries.every(e=>/^[0-9a-f]{64}$/.test(e.sha256)))});
test('migration runner rejects Neon and production targets',()=>{assert.throws(()=>assertTestTarget('postgresql://u:p@neon.tech/pair-live-db'),/test_target_guard_rejected/);assert.throws(()=>assertTestTarget('postgresql://u:p@127.0.0.1/pair-live-db'),/test_target_guard_rejected/);assert.equal(assertTestTarget('postgresql://u:p@127.0.0.1/pair_live_migration_test'),'postgresql://u:p@127.0.0.1/pair_live_migration_test')});

test('migration 021 removes only the new-member point default',async()=>{const entries=await migrationManifest();const sql=entries.find(e=>e.path==='migrations/021_remove_demo_member_balance_default.sql')?.sql;assert.match(sql||'',/ALTER TABLE members ALTER COLUMN demo_points SET DEFAULT 0;/);assert.doesNotMatch(sql||'',/\bUPDATE\s+members\b/i)});

test('V13 extension accepts V12 028–030 arriving later only',()=>{
 const ordered=['migrations/027_round_reset_rls_access.sql','migrations/028_external_live_tenants.sql','migrations/029_external_live_tenant_security.sql','migrations/030_external_live_schema_binding.sql','migrations/031_owner_usage_metrics.sql'];
 assert.doesNotThrow(()=>assertMigrationOrder(ordered,new Set([ordered[0],ordered[4]])));
 assert.doesNotThrow(()=>assertMigrationOrder(ordered,new Set([ordered[0],ordered[1],ordered[4]])));
 assert.throws(()=>assertMigrationOrder(ordered,new Set([ordered[0],ordered[3]])),/migration_order_gap/);
 assert.throws(()=>assertMigrationOrder([...ordered.slice(0,1),'migrations/020_missing.sql',ordered[4]],new Set([ordered[0],ordered[4]])),/migration_order_gap/);
 assert.doesNotThrow(()=>assertMigrationOrder([...migrationPaths],new Set(migrationPaths)));
});
test('main migration filenames and numbers cannot collide across branches',()=>{
 assert.doesNotThrow(()=>assertUniqueMigrationNumbers([...migrationPaths]));
 assert.throws(()=>assertUniqueMigrationNumbers([...migrationPaths,'migrations/030_owner_usage_metrics.sql']),/duplicate_migration_number/);
 assert.throws(()=>assertUniqueMigrationNumbers([...migrationPaths,migrationPaths.at(-1)!]),/duplicate_migration_filename/);
});
test('a persistent legacy V13 030 history stops before schema changes',()=>{
 assert.throws(()=>assertNoLegacyV13History(new Set(['migrations/030_owner_usage_metrics.sql'])),/legacy_v13_030_history_requires_reconciliation/);
 assert.doesNotThrow(()=>assertNoLegacyV13History(new Set(['migrations/030_external_live_schema_binding.sql'])));
});
