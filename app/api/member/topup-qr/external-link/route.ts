import {currentMember} from '../../../../../lib/server/auth-http';
import {createExternalQrToken} from '../../../../../lib/topup/external-qr';
import {noStore,topupFailure} from '../../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){
 try{
  if(!await currentMember())return Response.json({error:'not_authenticated'},{status:401,headers:noStore});
  const secret=process.env.LINE_LOGIN_CHANNEL_SECRET;
  if(!secret)return Response.json({error:'qr_link_not_configured'},{status:503,headers:noStore});
  const {expires,signature}=createExternalQrToken(secret);
  const url=new URL('/api/member/topup-qr/external-image',request.url);
  url.searchParams.set('exp',String(expires));url.searchParams.set('sig',signature);
  return Response.json({url:url.toString(),expires},{headers:noStore});
 }catch(e){return topupFailure(e)}
}
