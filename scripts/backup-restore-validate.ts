import {spawn} from 'node:child_process';
import {chmod,readdir,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {rootCertificates} from 'node:tls';
import {Pool} from 'pg';
import {assertRailwayStagingTarget,assertRailwayRestoreTarget} from '../lib/server/staging-target';
import {assertNeonMigrationTarget} from '../lib/server/neon-migration-target';
import {databaseConnectionOptions} from '../lib/server/db';

const testDatabase='pair_live_restore_test';
const tables=['members','member_wallet_ledger','member_topup_requests','member_topup_audit','member_withdrawal_requests','member_withdrawal_audit','round_entries'] as const;

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
   const category=/root certificate|sslrootcert/i.test(failure)?'tls_ca_missing':/does not match host|hostname mismatch/i.test(failure)?'tls_hostname_mismatch':/certificate verify/i.test(failure)?'tls_ca_untrusted':/translate host|name or service not known|temporary failure in name resolution/i.test(failure)?'dns_failed':/password authentication failed/i.test(failure)?'authentication_failed':/permission denied|row security/i.test(failure)?'permission_denied':/server version mismatch|aborting because of server version/i.test(failure)?'version_mismatch':'failed';
   reject(new Error(`${command}_${category}`));
  });
 });
}

async function baseline(pool:Pool){
 const result:Record<string,string>={};
 for(const table of tables){
  const count=await pool.query(`SELECT count(*)::text AS count FROM ${table}`);
  result[table]=count.rows[0].count;
 }
 const points=await pool.query('SELECT coalesce(sum(demo_points),0)::text AS points FROM members');
 result.points=points.rows[0].points;
 return result;
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
  const neonPool=new Pool({...databaseConnectionOptions(rawNeon),max:1});
 try{
  const version=await stagingPool.query("SELECT current_setting('server_version_num')::int AS version");
  if(Number(version.rows[0]?.version)<180000)throw new Error('restore_postgres_version_incompatible');
  console.log('restore_postgres_version_verified');
  const present=await stagingPool.query('SELECT 1 FROM pg_database WHERE datname=$1',[testDatabase]);
  if(present.rowCount)throw new Error('restore_test_database_already_exists');
  await baseline(neonPool);
  console.log('neon_readonly_baseline_verified');
  const archiveDir=await stat('/backup');
  if(!archiveDir.isDirectory())throw new Error('backup_volume_missing');
  let archive='';
  const candidates=(await readdir('/backup')).filter(name=>/^neon-pre-v15-[\dTZ-]+\.dump$/.test(name)).sort().reverse();
  for(const name of candidates){
   const candidate=join('/backup',name),saved=await stat(candidate);
   if(Date.now()-saved.mtimeMs>900_000||saved.size<1024)continue;
   try{const listing=await run('pg_restore',['--list',candidate]);if(listing.includes('TABLE DATA')&&listing.includes('members')){archive=candidate;break}}catch{/* Ignore an incomplete earlier attempt. */}
  }
  if(!archive){
   archive=join('/backup',`neon-pre-v15-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
   await run('pg_dump',['--format=custom','--no-owner','--no-acl','--file',archive,'--dbname',neonUrl.toString()]);
  }
  await chmod(archive,0o600);
  const saved=await stat(archive);
  if(saved.size<1024)throw new Error('backup_archive_incomplete');
  const listing=await run('pg_restore',['--list',archive]);
  if(!listing.includes('TABLE DATA')||!listing.includes('members'))throw new Error('backup_archive_incomplete');
  await writeFile('/backup/latest-archive',archive+'\n',{mode:0o600});
  console.log('backup_archive_verified');

  await stagingPool.query(`CREATE DATABASE ${testDatabase}`);
  const testUrl=new URL(stagingUrl);
  testUrl.pathname=`/${testDatabase}`;
  assertRailwayRestoreTarget({...env,RESTORE_TEST_DATABASE_URL:testUrl.toString()});
  await run('pg_restore',['--exit-on-error','--clean','--if-exists','--no-owner','--no-acl','--dbname',testUrl.toString(),archive]);
  const testPool=new Pool({connectionString:testUrl.toString(),ssl:{rejectUnauthorized:false},max:1});
  try{
   const restored=await baseline(testPool);
   console.log('restore_baseline_verified');
   const migrationEnv={...env,RESTORE_TEST_DATABASE_URL:testUrl.toString()};
   await run('npm',['run','db:migrate','--','--restore-apply'],migrationEnv);
   await run('npm',['run','db:migrate','--','--restore-validate'],migrationEnv);
   const after=await baseline(testPool);
   if(JSON.stringify(after)!==JSON.stringify(restored))throw new Error('migration_baseline_mismatch');
   console.log('restore_migrations_verified');
  }finally{await testPool.end()}
 }finally{await neonPool.end();await stagingPool.end()}
}

void main().catch(error=>{
 console.error(error instanceof Error&&/^[a-z_]+$/.test(error.message)?error.message:'backup_restore_validation_failed');
 process.exitCode=1;
});
