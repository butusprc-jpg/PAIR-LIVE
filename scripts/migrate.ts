import {Pool} from 'pg';
import {expectedTables} from '../lib/schema-tables';
import {assertTestTarget,migrationManifest} from '../lib/migration-manifest';
async function main(){
const mode=process.argv[2];
if(!['--dry-run','--validate','--apply'].includes(mode)){console.error('usage: npm run db:migrate -- --dry-run|--validate|--apply (isolated local test DB only)');process.exit(2)}
const url=assertTestTarget(process.env.MIGRATION_TEST_DATABASE_URL);
const manifest=await migrationManifest();
const pool=new Pool({connectionString:url,ssl:false,max:2});
try{const client=await pool.connect();try{
 await client.query('SELECT pg_advisory_lock(728341, 1)');
 try{
  const found=await client.query("SELECT to_regclass('public.schema_migration_history') AS name");
  const tables=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");if(tables.rows.some(row=>!expectedTables.has(row.tablename)))throw new Error('unexpected_public_table');
  const installed=new Map<string,string>();
  if(found.rows[0].name){const rows=await client.query('SELECT path,sha256 FROM schema_migration_history ORDER BY path');for(const row of rows.rows)installed.set(row.path,row.sha256)}
  const known=new Set<string>(manifest.map(m=>m.path));for(const path of installed.keys())if(!known.has(path))throw new Error('unknown_installed_migration');
  let gap=false;for(const item of manifest){const hash=installed.get(item.path);if(hash&&hash!==item.sha256)throw new Error(`migration_hash_mismatch: ${item.path}`);if(!hash)gap=true;else if(gap)throw new Error(`migration_order_gap: ${item.path}`)}
  if(mode==='--validate'&&gap)throw new Error('pending_migrations');
  if(mode==='--apply'){
   if(!found.rows[0].name){const existing=await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");if(existing.rows[0].count!==0)throw new Error('untracked_existing_tables');await client.query('CREATE TABLE schema_migration_history(path text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())')}
   for(const item of manifest){if(installed.has(item.path)){console.log(`SKIP ${item.path} ${item.sha256}`);continue}await client.query('BEGIN');try{await client.query(item.sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));await client.query('INSERT INTO schema_migration_history(path,sha256) VALUES($1,$2)',[item.path,item.sha256]);await client.query('COMMIT');console.log(`APPLIED ${item.path} ${item.sha256}`)}catch(error){await client.query('ROLLBACK');throw error}}
  }else for(const item of manifest)console.log(`${installed.has(item.path)?'INSTALLED':'PENDING'} ${item.path} ${item.sha256}`);
 }finally{await client.query('SELECT pg_advisory_unlock(728341, 1)')}
}finally{client.release()}}catch(error){console.error(error instanceof Error?error.message:'migration_failed');process.exitCode=1}finally{await pool.end()}

}
void main().catch(error=>{console.error(error instanceof Error?error.message:'migration_failed');process.exitCode=1});
