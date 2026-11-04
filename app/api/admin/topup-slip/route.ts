import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {getSlip} from '../../../../lib/topup/slip';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  const auth=await adminAccess(request,['admin']);
  if(!auth.ok)return Response.json({error:'forbidden'},{status:403,headers:noStore});
  const id=new URL(request.url).searchParams.get('id')||'';
  const slip=await getSlip(database(),id);
  return new Response(new Uint8Array(slip.data),{headers:{...noStore,'Content-Type':slip.type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(e){return topupFailure(e)}
}
