import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {assertMigrationOrder,assertTestTarget,assertUniqueMigrationNumbers,migrationPaths} from '../lib/migration-manifest';

// Read-only pinned V12 CI source. This test runs after standalone V13 migration
// and integration tests, on the disposable PostgreSQL service container only.
const v12Commit='cb94edf23a86d59baa6e1a9ac8aca8d15795eb7f';
const v12Paths=[
 'migrations/028_external_live_tenants.sql',
 'migrations/029_external_live_tenant_security.sql',
 'migrations/030_external_live_schema_binding.sql',
];
const combined=[...migrationPaths.slice(0,-1),...v12Paths,migrationPaths.at(-1)!];
assertUniqueMigrationNumbers(combined);
async function main(){
const pool=new Pool({connectionString:assertTestTarget(process.env.MIGRATION_TEST_DATABASE_URL),ssl:false,max:1});
try{
 const client=await pool.connect();
 try{
  const installed=new Set<string>((await client.query('SELECT path FROM schema_migration_history')).rows.map(row=>row.path));
  if(!installed.has('migrations/031_owner_usage_metrics.sql')||v12Paths.some(path=>installed.has(path)))throw new Error('standalone_v13_history_expected');
  assertMigrationOrder(combined,installed);
  for(const path of v12Paths){
   const sql=execFileSync('git',['show',`${v12Commit}:${path}`],{encoding:'utf8'});
   const hash=createHash('sha256').update(sql).digest('hex');
   await client.query('BEGIN');
   try{
    await client.query(sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));
    await client.query('INSERT INTO schema_migration_history(path,sha256) VALUES($1,$2)',[path,hash]);
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error}
  }
  const rows=(await client.query('SELECT path,sha256 FROM schema_migration_history WHERE path=ANY($1) ORDER BY path',[[...v12Paths,'migrations/031_owner_usage_metrics.sql']])).rows;
  if(rows.length!==4||rows.some(row=>!row.sha256||!combined.includes(row.path)))throw new Error('combined_history_invalid');
  const tables=(await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('external_live_tenants','owner_usage_daily')")).rows;
  if(tables.length!==2||tables.some(row=>!row.relrowsecurity||!row.relforcerowsecurity))throw new Error('combined_rls_invalid');
  console.log('PASS V13 031 then V12 028–030 on disposable PostgreSQL; distinct history and FORCE RLS retained');
 }finally{client.release()}
}finally{await pool.end()}
}
void main().catch(error=>{console.error(error);process.exitCode=1});
