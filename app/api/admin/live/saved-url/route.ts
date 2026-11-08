import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {parseYouTubeId} from '../../../../../modules/external-live/server/youtube-url';
import {LiveError} from '../../../../../modules/external-live/types';
export const runtime='nodejs';
export async function GET(request:Request){
 const access=await adminAccess(request,['admin','operator','viewer']);
 if(!access.ok)return adminDenied(access.error);
 try{const result=await database().query("SELECT embed_url FROM external_live_settings WHERE id=1");
 return Response.json({url:result.rows[0]?.embed_url||''},{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'saved_url_unavailable'},{status:503})}
}
export async function POST(request:Request){
 const access=await adminAccess(request,['admin','operator'],true);
 if(!access.ok)return adminDenied(access.error);
 try{
  const raw=await request.text();
  if(raw.length>600)return Response.json({error:'body_too_large'},{status:413});
  const body=JSON.parse(raw);
  const videoId=parseYouTubeId(body?.url);
  const canonical='https://www.youtube.com/watch?v='+videoId;
  await database().query(`INSERT INTO external_live_settings(id,embed_url,provider,status,updated_at,updated_by)
   VALUES(1,$1,'youtube','READY',now(),$2)
   ON CONFLICT(id) DO UPDATE SET embed_url=EXCLUDED.embed_url,provider='youtube',status='READY',updated_at=now(),updated_by=EXCLUDED.updated_by`,[canonical,access.value.admin.id]);
  return Response.json({ok:true,url:canonical},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof LiveError)return Response.json({error:error.code},{status:error.status});
  if(error instanceof SyntaxError)return Response.json({error:'invalid_json'},{status:400});
  return Response.json({error:'save_url_failed'},{status:503});
 }
}
