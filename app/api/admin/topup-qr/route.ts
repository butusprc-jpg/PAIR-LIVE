import {adminAccess} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {MAX_QR_BYTES,readQr,saveQr} from '../../../../lib/topup/qr';
import {TopupError} from '../../../../lib/topup/store';
import {noStore,topupFailure} from '../../../../lib/topup/http';
export const runtime='nodejs';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin']);if(!a.ok)return Response.json({error:'forbidden'},{status:403});const qr=await readQr(database());return new Response(new Uint8Array(qr.data),{headers:{...noStore,'Content-Type':qr.type,'X-Content-Type-Options':'nosniff'}})}catch(e){return topupFailure(e)}}
export async function POST(request:Request){try{const a=await adminAccess(request,['admin'],true);if(!a.ok)return Response.json({error:'forbidden'},{status:403});const reader=request.body?.getReader();if(!reader)throw new TopupError('image_missing');let size=0;const chunks:Buffer[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_QR_BYTES){await reader.cancel();throw new TopupError('invalid_image_size')}chunks.push(Buffer.from(value))}return Response.json(await saveQr(database(),a.value.admin.id,Buffer.concat(chunks)),{headers:noStore})}catch(e){return topupFailure(e)}}
