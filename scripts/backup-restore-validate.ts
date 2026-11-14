import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {chmod,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {rootCertificates} from 'node:tls';
import {Pool,type PoolClient} from 'pg';
import {assertRailwayStagingTarget,assertRailwayRestoreTarget} from '../lib/server/staging-target';
import {assertNeonMigrationTarget} from '../lib/server/neon-migration-target';
import {databaseConnectionOptions} from '../lib/server/db';
import {migrationManifest} from '../lib/migration-manifest';

const testDatabase='pair_live_restore_test';
const tables=['members','member_wallet_ledger','member_topup_requests','member_topup_audit','member_withdrawal_requests','member_withdrawal_audit','rounds','round_entries','round_audit_logs','round_settlement_awards','round_result_line_outbox','round_ocr_evidence'] as const;
const fingerprintTables=['members','member_wallet_ledger','member_topup_requests','member_withdrawal_requests','rounds','round_entries','round_audit_logs'] as const;
const ocrMigrations=['045_legacy_round_award_ledger','046_camera_ocr_roi','047_round_ocr_candidate_lock','048_ocr_candidate_images','049_ocr_candidate_settlement'].map(name=>`migrations/${name}.sql`);

async function run(command:string,args:string[],env=process.env){
 return new Promise<string>((resolve,reject)=>{
  const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});
  let output='',failure='';
  child.stdout.on('data',(chunk:Buffer)=>{output+=chunk.toString();if(output.length>1_000_000)child.kill()});
  // Classify errors in memory; stderr may contain connection information.
  child.stderr.on('data',(chunk:Buffer)=>{failure=(failure+chunk.toString()).slice(-4096)});
  child.on('error',()=>reject(new Error(`${command}_failed`)));
  child.on('exit',code=>{
   if(code===0)return resolve(output);
   const category=/root certificate|sslrootcert/i.test(failure)?'tls_ca_missing':/does not match host|hostname mismatch/i.test(failure)?'tls_hostname_mismatch':/certificate verify/i.test(failure)?'tls_ca_untrusted':/translate host|name or service not known|temporary failure in name resolution/i.test(failure)?'dns_failed':/password authentication failed/i.test(failure)?'authentication_failed':/role .* does not exist/i.test(failure)?'role_missing':/unrecognized configuration parameter/i.test(failure)?'server_setting_incompatible':/permission denied|row security/i.test(failure)?'permission_denied':/server version mismatch|aborting because of server version/i.test(failure)?'version_mismatch':'failed';
   reject(new Error(`${command}_${category}`));
  });
 });
}

async function baseline(pool:Pool|PoolClient){
 const result:Record<string,string>={};
 for(const table of tables){
  const count=await pool.query(`SELECT count(*)::text AS count FROM ${table}`);
  result[table]=count.rows[0].count;
 }
 const points=await pool.query('SELECT coalesce(sum(demo_points),0)::text AS points FROM members');
 result.points=points.rows[0].points;
 const entries=await pool.query('SELECT coalesce(sum(demo_points),0)::text AS points FROM round_entries');
 result.entry_points=entries.rows[0].points;
 for(const table of fingerprintTables){
  const digest=await pool.query(`SELECT md5(coalesce(string_agg(md5(row_to_json(t)::text),',' ORDER BY id::text),'')) AS digest FROM ${table} t`);
  result[`${table}_fingerprint`]=digest.rows[0].digest;
 }
 return result;
}

async function archiveSha256(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex')}

async function validateOcrSchema(pool:Pool){
 const manifest=new Map((await migrationManifest()).map(item=>[item.path,item.sha256]));
 const installed=await pool.query('SELECT path,sha256 FROM schema_migration_history WHERE path=ANY($1::text[])',[ocrMigrations]);
 if(installed.rows.length!==ocrMigrations.length||installed.rows.some(row=>manifest.get(row.path)!==row.sha256))throw new Error('restore_ocr_migration_history_invalid');
 for(const table of ['round_legacy_award_ledger','camera_ocr_roi','round_ocr_candidate_locks','round_ocr_candidate_images','round_ocr_image_delete_audit']){
  if(!(await pool.query('SELECT to_regclass($1) AS name',[table])).rows[0].name)throw new Error('restore_ocr_table_missing');
 }
 const constraints=await pool.query("SELECT conname FROM pg_constraint WHERE conname=ANY($1::text[])",[['award_one_ledger','round_ocr_evidence_source_type_check']]);
 if(constraints.rows.length!==2)throw new Error('restore_ocr_constraint_missing');
 const indexes=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname=ANY($1::text[])",[['round_ocr_candidate_images_oa_round_idx','round_ocr_candidate_images_round_id_key','round_ocr_evidence_candidate_image_id_key']]);
 if(indexes.rows.length!==3)throw new Error('restore_ocr_index_missing');
 const empty=await pool.query('SELECT (SELECT count(*) FROM round_legacy_award_ledger)+(SELECT count(*) FROM round_ocr_candidate_locks)+(SELECT count(*) FROM round_ocr_candidate_images) AS count');
 if(Number(empty.rows[0].count)!==0)throw new Error('restore_ocr_new_tables_not_empty');
}

async function main(){
 const env=process.env;
 const stagingUrl=assertRailwayStagingTarget(env);
 assertNeonMigrationTarget(env);
 const rawNeon=env.NEON_CUTOVER_DATABASE_URL!;
 const neonUrl=new URL(rawNeon);
  if(neonUrl.hostname.includes('-pooler.'))neonUrl.hostname=env.EXPECTED_NEON_HOST!;
 neonUrl.searchParams.set('sslmode','verify-full');
  const caPath='/tmp/neon-root-ca.pem';
  await writeFile(caPath,rootCertificates.join('\n'),{mode:0o600});
  neonUrl.searchParams.set('sslrootcert',caPath);
 const stagingPool=new Pool({connectionString:stagingUrl,ssl:{rejectUnauthorized:false},max:1});
  const neonPool=new Pool({...databaseConnectionOptions(neonUrl.toString()),max:1});
 try{
  const version=await stagingPool.query("SELECT current_setting('server_version_num')::int AS version");
  if(Number(version.rows[0]?.version)<180000)throw new Error('restore_postgres_version_incompatible');
  console.log('restore_postgres_version_verified');
  const archiveDir=await stat('/backup');
  if(!archiveDir.isDirectory())throw new Error('backup_volume_missing');
  const archive=join('/backup',`neon-pre-v16-ocr-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
  const snapshotClient=await neonPool.connect();let productionBaseline:Record<string,string>;
  try{
   await snapshotClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const snapshot=(await snapshotClient.query<{snapshot:string}>('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
   productionBaseline=await baseline(snapshotClient);
   console.log('neon_readonly_baseline_verified');
   await run('pg_dump',['--format=custom','--no-owner','--no-acl','--snapshot',snapshot,'--file',archive,'--dbname',neonUrl.toString()]);
   await snapshotClient.query('COMMIT');
  }catch(error){await snapshotClient.query('ROLLBACK').catch(()=>{});throw error}finally{snapshotClient.release()}
  await chmod(archive,0o600);
  const saved=await stat(archive);
  if(saved.size<1024)throw new Error('backup_archive_incomplete');
  const listing=await run('pg_restore',['--list',archive]);
  if(!listing.includes('TABLE DATA')||!listing.includes('members'))throw new Error('backup_archive_incomplete');
  const checksum=await archiveSha256(archive);
  if(!/^[0-9a-f]{64}$/.test(checksum))throw new Error('backup_archive_checksum_failed');
  await writeFile('/backup/latest-archive',archive+'\n',{mode:0o600});
  console.log('backup_archive_verified');

  // Each run restores into a fresh disposable database so prior validation
  // migrations cannot survive pg_restore --clean and distort the result.
  await stagingPool.query(`DROP DATABASE IF EXISTS ${testDatabase} WITH (FORCE)`);
  await stagingPool.query(`CREATE DATABASE ${testDatabase}`);
  // pg_dump does not export cluster roles, but RLS policies refer to these
  // existing Neon roles. Create inert stand-ins only on isolated staging PG.
  for(const role of ['neondb_owner','pair_round_reset_counter','pair_round_reset_executor']){
   const found=await stagingPool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
   if(!found.rowCount)await stagingPool.query(`CREATE ROLE ${role} NOLOGIN`);
  }
  console.log('restore_roles_ready');
  const testUrl=new URL(stagingUrl);
  testUrl.pathname=`/${testDatabase}`;
  assertRailwayRestoreTarget({...env,RESTORE_TEST_DATABASE_URL:testUrl.toString()});
  await run('pg_restore',['--exit-on-error','--clean','--if-exists','--no-owner','--no-acl','--dbname',testUrl.toString(),archive]);
  const testPool=new Pool({connectionString:testUrl.toString(),ssl:{rejectUnauthorized:false},max:1});
  try{
   const restored=await baseline(testPool);
   if(JSON.stringify(restored)!==JSON.stringify(productionBaseline))throw new Error('production_restore_baseline_mismatch');
   console.log('restore_baseline_verified');
   const migrationEnv={...env,RESTORE_TEST_DATABASE_URL:testUrl.toString()};
   await run('npm',['run','db:migrate','--','--restore-apply'],migrationEnv);
   await run('npm',['run','db:migrate','--','--restore-validate'],migrationEnv);
   const after=await baseline(testPool);
   if(JSON.stringify(after)!==JSON.stringify(restored))throw new Error('migration_baseline_mismatch');
   await validateOcrSchema(testPool);
   const manifestFile=`${archive}.validation.json`;
   await writeFile(manifestFile,JSON.stringify({archive,sha256:checksum,bytes:saved.size,validatedAt:new Date().toISOString(),productionBaseline,before:restored,after,migrations:ocrMigrations})+'\n',{mode:0o600});
   console.log('restore_migrations_verified');
  }finally{await testPool.end()}
 }finally{await neonPool.end();await stagingPool.end()}
}

void main().catch(error=>{
 console.error(error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'backup_restore_validation_failed');
 process.exitCode=1;
});
