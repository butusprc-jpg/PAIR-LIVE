import {currentMember} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readQr} from '../../../../lib/topup/qr';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){try{if(!await currentMember())return Response.json({error:'not_authenticated'},{status:401});const qr=await readQr(database());return new Response(new Uint8Array(qr.data),{headers:{...noStore,'Content-Type':qr.type,'X-Content-Type-Options':'nosniff',...(new URL(request.url).searchParams.has('download')?{'Content-Disposition':`attachment; filename="pair-live-qr.${qr.type==='image/jpeg'?'jpg':qr.type.split('/')[1]}"`}:{})}})}catch(e){return topupFailure(e)}}
