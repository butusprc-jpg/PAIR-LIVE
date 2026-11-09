import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const migrationPaths=[
 'migrations/001_members.sql',
 'migrations/002_round_engine.sql',
 'migrations/003_ocr_evidence.sql',
 'migrations/004_evidence_audit.sql',
 'modules/member-wallet/migrations/001_member_wallet.sql',
 'migrations/005_wallet_round_integration.sql',
 'migrations/006_wallet_cutover_state.sql',
 'migrations/007_line_webhook.sql',
 'migrations/008_line_webhook_processing.sql',
 'modules/admin-auth/migrations/001_admin_auth.sql',
 'modules/report-notification/migrations/001_report_notification.sql',
 'migrations/009_evidence_verification_decisions.sql',
 'migrations/010_manual_topups.sql',
 'migrations/011_member_topup_slips.sql',
 'migrations/012_topup_line_notifications.sql',
 'migrations/013_line_topup_postbacks.sql',
 'migrations/014_topup_retention.sql',
 'migrations/015_topup_member_line_outbox.sql',
 'migrations/016_member_withdrawals.sql',
 'migrations/017_withdrawal_debit_timing.sql',
 'migrations/018_admin_role_management.sql',
 'migrations/019_round_line_broadcast.sql',
 'migrations/020_external_live.sql',
 'migrations/021_remove_demo_member_balance_default.sql',
 'migrations/022_oa_service_control.sql',
 'migrations/023_owner_email_auth.sql',
 'migrations/024_oa_pause_remove.sql',
 'migrations/025_round_countdown_member_line.sql',
 'migrations/026_round_reset_epoch.sql',
 'migrations/027_round_reset_rls_access.sql',
 'migrations/028_external_live_tenants.sql',
 'migrations/029_external_live_tenant_security.sql',
 'migrations/030_external_live_schema_binding.sql',
 'migrations/031_owner_usage_metrics.sql',
 'migrations/032_vdo_ninja_live.sql',
 'migrations/033_line_shopping_live.sql',
 'migrations/034_vdo_ninja_tenants.sql',
 'migrations/035_vdo_remote_control.sql',
] as const;
export function assertUniqueMigrationNumbers(paths:readonly string[]){
 const seen=new Map<string,string>(),filenames=new Set<string>();
 for(const path of paths){if(filenames.has(path))throw new Error(`duplicate_migration_filename: ${path}`);filenames.add(path);
  if(!path.startsWith('migrations/'))continue;
  const match=/^migrations\/(\d{3})_[^/]+\.sql$/.exec(path);if(!match)throw new Error(`invalid_migration_filename: ${path}`);
  const prior=seen.get(match[1]);if(prior)throw new Error(`duplicate_migration_number: ${prior}, ${path}`);
  seen.set(match[1],path)
 }
}
export async function migrationManifest(root=process.cwd()){assertUniqueMigrationNumbers(migrationPaths);return Promise.all(migrationPaths.map(async path=>{const sql=await readFile(resolve(root,path),'utf8');return {path,sql,sha256:createHash('sha256').update(sql).digest('hex')}}))}
export function assertTestTarget(raw:string|undefined){if(!raw)throw new Error('test_database_url_missing');let url:URL;try{url=new URL(raw)}catch{throw new Error('invalid_test_database_url')}if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/pair_live_migration_test')throw new Error('test_target_guard_rejected');return raw}
export function assertNoLegacyV13History(paths:ReadonlySet<string>){
 if(paths.has('migrations/030_owner_usage_metrics.sql'))throw new Error('legacy_v13_030_history_requires_reconciliation')
}

// V12 can be merged after V13 was installed. Only its reserved 028–030 files
// may be inserted before an already-installed 031; all other gaps stay fatal.
export function assertMigrationOrder(paths:readonly string[],installed:Set<string>){
 const prior:string[]=[];
 for(const path of paths){if(!installed.has(path)){prior.push(path);continue}
  if(prior.some(missing=>!(installed.has('migrations/031_owner_usage_metrics.sql')&&/^migrations\/0(?:28|29|30)_[^/]+\.sql$/.test(missing))))throw new Error(`migration_order_gap: ${path}`)
 }
}
