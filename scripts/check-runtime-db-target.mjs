import pg from 'pg';
import {pathToFileURL} from 'node:url';

export function expectedNeonHost(host,expected){
 const direct=expected?.toLowerCase();
 if(!direct||!direct.startsWith('ep-')||!direct.includes('.c-')||!direct.endsWith('.neon.tech'))return false;
 return host.toLowerCase()===direct||host.toLowerCase()===direct.replace(/^(ep-[^.]+)(\.)/,'$1-pooler$2');
}

export function verifiedClientTls(client){
 // pg_stat_ssl describes the pooler-to-Postgres hop, not the app-to-pooler socket.
 const socket=client.connection?.stream;
 return socket?.encrypted===true&&socket.authorized===true&&socket.authorizationError==null;
}

export async function checkRuntimeDbTarget(env=process.env,PoolClass=pg.Pool){
 const source=env.DB_TARGET_SOURCE==='cutover'?'cutover':'database';
 const raw=source==='cutover'?env.NEON_CUTOVER_DATABASE_URL:env.DATABASE_URL;
 if(!raw)throw new Error('database_url_missing');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('database_url_invalid');
 const host=url.hostname.toLowerCase();
 const local=['localhost','127.0.0.1','::1'].includes(host);
 const railway=host.endsWith('.railway.internal');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const ssl=local||railway?false:{rejectUnauthorized:true};
 const pool=new PoolClass({connectionString:url.toString(),ssl,max:1,connectionTimeoutMillis:5000});
 try{
  const client=await pool.connect();
  try{
   const result=await client.query('SELECT current_database() AS database');
   const database=String(result.rows[0]?.database||'');
   const tls=ssl!==false&&ssl.rejectUnauthorized===true&&verifiedClientTls(client);
   const target=railway?'railway-postgres':host.endsWith('.neon.tech')?'neon':'other';
   const matchesExpected=Boolean(target==='neon'&&expectedNeonHost(host,env.EXPECTED_NEON_HOST)&&
    env.EXPECTED_NEON_DATABASE&&database===env.EXPECTED_NEON_DATABASE&&tls);
   return {target,host,database,tls,matchesExpected,dbTargetSource:source};
  }finally{client.release()}
 }finally{await pool.end()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
checkRuntimeDbTarget().then(result=>{
 console.log(JSON.stringify(result));
 if(!result.matchesExpected)process.exitCode=1;
}).catch(error=>{
 const rawCode=error?.code;
 const code=typeof rawCode==='string'&&/^[A-Z0-9_]{2,40}$/.test(rawCode)?rawCode:
  error?.message==='database_url_missing'?'DATABASE_URL_MISSING':
  error?.message==='database_url_invalid'?'DATABASE_URL_INVALID':'UNKNOWN';
 console.error(JSON.stringify({status:'runtime_db_target_check_failed',code}));
 process.exitCode=1;
});
}
