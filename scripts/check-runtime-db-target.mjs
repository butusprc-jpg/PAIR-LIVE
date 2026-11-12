import pg from 'pg';

async function main(){
 const raw=process.env.DATABASE_URL;
 if(!raw)throw new Error('database_url_missing');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('database_url_invalid');
 const host=url.hostname.toLowerCase();
 const local=['localhost','127.0.0.1','::1'].includes(host);
 const railway=host.endsWith('.railway.internal');
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const pool=new pg.Pool({connectionString:url.toString(),ssl:local||railway?false:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:5000});
 try{
  const result=await pool.query(`SELECT current_database() AS database,
   (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`);
  const database=String(result.rows[0].database);
  const tls=result.rows[0].tls===true;
  const target=railway?'railway-postgres':host.endsWith('.neon.tech')?'neon':'other';
  const expectedHost=process.env.EXPECTED_NEON_HOST?.toLowerCase();
  const expectedDatabase=process.env.EXPECTED_NEON_DATABASE;
  const matchesExpected=Boolean(expectedHost&&expectedDatabase&&host===expectedHost&&database===expectedDatabase&&tls);
  console.log(JSON.stringify({target,host,database,tls,matchesExpected}));
  if(expectedHost&&expectedDatabase&&!matchesExpected)process.exitCode=1;
 }finally{await pool.end()}
}

main().catch(()=>{console.error('runtime_db_target_check_failed');process.exitCode=1});
