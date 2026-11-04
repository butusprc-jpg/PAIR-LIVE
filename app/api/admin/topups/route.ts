import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {decideTopup,listTopups} from '../../../../lib/topup/store';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin']);if(!a.ok)return Response.json({error:'forbidden'},{status:403,headers:noStore});const q=new URL(request.url).searchParams;return Response.json({requests:await listTopups(database(),null,q.get('search')||'',q.get('status')||'')},{headers:noStore})}catch(e){return topupFailure(e)}}
export async function POST(request:Request){try{const a=await adminAccess(request,['admin'],true);if(!a.ok)return Response.json({error:'forbidden'},{status:403,headers:noStore});const b=await request.json();return Response.json({request:await decideTopup(database(),a.value.admin.id,b.id,b.action,b.note??'')},{headers:noStore})}catch(e){return topupFailure(e)}}
