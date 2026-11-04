import {database} from '../../../../../lib/server/db';
import {readQr} from '../../../../../lib/topup/qr';
import {verifyExternalQrToken} from '../../../../../lib/topup/external-qr';
import {noStore,topupFailure} from '../../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  const url=new URL(request.url);
  const valid=verifyExternalQrToken(url.searchParams.get('exp'),url.searchParams.get('sig'),process.env.LINE_LOGIN_CHANNEL_SECRET||'');
  if(!valid)return Response.json({error:'qr_link_expired'},{status:403,headers:noStore});
  const qr=await readQr(database());
  return new Response(new Uint8Array(qr.data),{headers:{...noStore,'Content-Type':qr.type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(e){return topupFailure(e)}
}
