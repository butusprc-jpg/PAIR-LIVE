import {database} from '../../../../lib/server/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

// Staging-only read-only database target diagnostic. Never expose connection strings,
// credentials, roles, IP addresses, or database hostnames over HTTP.
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
  return Response.json({target,tls,matchesExpected},{headers});
 }catch{return Response.json({status:'database_unavailable'},{status:503,headers})}
}
