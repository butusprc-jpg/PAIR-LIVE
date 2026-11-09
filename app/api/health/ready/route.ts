import {database} from '../../../../lib/server/db';
import {readiness} from '../../../../lib/server/readiness';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try {if(await readiness(database()))return Response.json({status:'ready'},{headers:{'Cache-Control':'no-store'}})} catch {}
 return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
}
