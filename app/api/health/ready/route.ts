import {database} from '../../../../lib/server/db';
import {readinessStatus} from '../../../../lib/server/readiness';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 let status:'ready'|'database_unavailable'|'oa_binding_unavailable'='database_unavailable';
 try {status=await readinessStatus(database())} catch {}
 return Response.json({status},{status:status==='ready'?200:503,headers:{'Cache-Control':'no-store'}});
}
