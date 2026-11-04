import sharp from 'sharp';
import {database} from '../../../../lib/server/db';
import {getSlip} from '../../../../lib/topup/slip';
import {validSlipLink} from '../../../../lib/topup/line-card';
export const runtime='nodejs';
export async function GET(request:Request){
 const q=new URL(request.url).searchParams,id=q.get('id')||'',exp=q.get('exp')||'',sig=q.get('sig')||'';
 try{
  if(!validSlipLink(id,exp,sig))return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
  const slip=await getSlip(database(),id);
  // LINE Flex image components require a publicly fetchable JPEG/PNG within 1024px.
  const jpeg=await sharp(slip.data,{limitInputPixels:16000000,animated:false}).rotate().resize(1024,1024,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85,mozjpeg:true}).toBuffer();
  if(jpeg.length>10*1024*1024)throw new Error('preview_too_large');
  return new Response(new Uint8Array(jpeg),{headers:{'Content-Type':'image/jpeg','Content-Length':String(jpeg.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(e){return new Response(null,{status:e instanceof Error&&e.message==='slip_expired'?410:503,headers:{'Cache-Control':'no-store'}})}
}
