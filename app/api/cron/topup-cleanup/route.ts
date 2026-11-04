import {timingSafeEqual} from 'node:crypto';
import {database} from '../../../../lib/server/db';
import {cleanupTopupTemporary} from '../../../../lib/topup/retention';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;
 const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!expected||!supplied||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return new Response(null,{status:403});
 if(process.env.TOPUP_CLEANUP_ENABLED!=='true')return Response.json({enabled:false},{headers:{'Cache-Control':'no-store'}});
 try{return Response.json({enabled:true,result:await cleanupTopupTemporary(database())},{headers:{'Cache-Control':'no-store'}})}
 catch(error){console.error('topup_cleanup_error',error instanceof Error?error.name:'unknown');return Response.json({error:'cleanup_failed'},{status:503})}
}
