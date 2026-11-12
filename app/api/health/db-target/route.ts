import {Pool} from 'pg';
import {database, databaseConnectionOptions} from '../../../../lib/server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

// Read-only staging diagnosis: the primary pool remains on Railway Postgres.
// The optional Neon probe never runs migrations, member queries, or writes.
async function probeNeon(env:NodeJS.ProcessEnv){
 const raw=env.NEON_CUTOVER_DATABASE_URL;
 if(!raw)return {status:'not_configured'};
 let url:URL;
 try{url=new URL(raw)}catch{return {status:'invalid_url'}};
 const expected=(env.EXPECTED_NEON_HOST||'').toLowerCase();
 if(!url.hostname.toLowerCase().endsWith('.neon.tech'))return {status:'not_neon'};
 const pooledHost=expected.replace(/^(ep-[^.]+)(\.)/, '$1-pooler$2');
 if(!expected||![expected,pooledHost].includes(url.hostname.toLowerCase()))return {status:'host_mismatch'};
 if(!env.EXPECTED_NEON_DATABASE||decodeURIComponent(url.pathname.slice(1))!==env.EXPECTED_NEON_DATABASE)return {status:'database_mismatch'};
 const pool=new Pool({...databaseConnectionOptions(raw),max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,statement_timeout:5000});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN READ ONLY');
  const result=await client.query("SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls");
  const row=result.rows[0];
  await client.query('ROLLBACK');
  // Neon pooled connections terminate client TLS at the pooler; pg_stat_ssl reports the pooler-to-Postgres hop.\n  // databaseConnectionOptions enforces certificate-verified TLS on the client socket.\n  return {status:row?.database===env.EXPECTED_NEON_DATABASE?'connected':'verification_failed'};
 }catch{return {status:'connection_failed'}}
 finally{
  if(client)client.release();
  await pool.end().catch(()=>{});
 }
}

// All responses contain only coarse statuses. Never disclose credentials, SQL,
// connection strings, hosts, role names, errors, or member data.
export async function GET(){
 const env=process.env;
 if(env.RAILWAY_PROJECT_ID!=='5a54ffee-e6e9-49c9-945e-9f2225c8acf8'||
    env.RAILWAY_ENVIRONMENT_ID!=='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'||
    env.RAILWAY_STAGING_NO_LINE!=='true')return Response.json({error:'not_found'},{status:404,headers});
 try{
  const url=new URL(env.DATABASE_URL||'');
  const host=url.hostname.toLowerCase();
  const target=host.endsWith('.railway.internal')?'railway-postgres':host.endsWith('.neon.tech')?'neon':'other';
  const connection=await database().query("SELECT current_database() AS database,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls");
  const databaseName=String(connection.rows[0]?.database||'');
  const tls=connection.rows[0]?.tls===true;
  const matchesExpected=Boolean(host&&env.EXPECTED_NEON_HOST&&host===env.EXPECTED_NEON_HOST.toLowerCase()&&
   env.EXPECTED_NEON_DATABASE&&databaseName===env.EXPECTED_NEON_DATABASE&&tls);
  const neon=await probeNeon(env);
  return Response.json({target,tls,matchesExpected,neon},{headers});
 }catch{return Response.json({status:'database_unavailable'},{status:503,headers})}
}
