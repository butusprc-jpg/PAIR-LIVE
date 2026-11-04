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
] as const;
export async function migrationManifest(root=process.cwd()){return Promise.all(migrationPaths.map(async path=>{const sql=await readFile(resolve(root,path),'utf8');return {path,sql,sha256:createHash('sha256').update(sql).digest('hex')}}))}
export function assertTestTarget(raw:string|undefined){if(!raw)throw new Error('test_database_url_missing');let url:URL;try{url=new URL(raw)}catch{throw new Error('invalid_test_database_url')}if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/pair_live_migration_test')throw new Error('test_target_guard_rejected');return raw}
