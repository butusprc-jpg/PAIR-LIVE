import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {supportedLocales} from '../../../../lib/i18n';
export const runtime='nodejs';
export async function GET(){
 const member=await currentMember();
 if(!member)return Response.json({error:'not_authenticated'},{status:401});
 try{const result=await database().query('SELECT notification_locale,notification_locale_source FROM members WHERE id=$1',[member.id]);
  if(!result.rows[0])return Response.json({error:'member_not_found'},{status:404});
  return Response.json({locale:result.rows[0].notification_locale,source:result.rows[0].notification_locale_source},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'language_unavailable'},{status:503})}
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'csrf_origin'},{status:403});
 const member=await currentMember();
 if(!member)return Response.json({error:'not_authenticated'},{status:401});
 let body:unknown;try{body=await request.json()}catch{return Response.json({error:'invalid_language'},{status:400})}
 const locale=body&&typeof body==='object'&&'locale' in body?(body as {locale:unknown}).locale:null;
 if(!supportedLocales.some(value=>value===locale))return Response.json({error:'invalid_language'},{status:400});
 try{
  const result=await database().query('UPDATE members SET notification_locale=$2,notification_locale_source=\'choice\' WHERE id=$1 RETURNING notification_locale',[member.id,locale]);
  if(result.rowCount!==1)return Response.json({error:'member_not_found'},{status:404});
  return Response.json({locale:result.rows[0].notification_locale},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'language_unavailable'},{status:503})}
}
