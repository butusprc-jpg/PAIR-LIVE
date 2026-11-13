import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {database} from '../../../../lib/server/db';
import {readPlayRules,savePlayRules} from '../../../../lib/play-rules/store';
export const runtime='nodejs';
async function channel(id:string){if(process.env.RAILWAY_ENVIRONMENT_ID==='1eae6433-f3f1-474c-b1c6-aed7632ccdbf'&&process.env.RAILWAY_SINGLE_OA_MODE==='true'&&process.env.LINE_LOGIN_CHANNEL_ID)return process.env.LINE_LOGIN_CHANNEL_ID;return (await database().query<{provider_channel_id:string}>("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[id])).rows[0]?.provider_channel_id}
export async function GET(request:Request){
 try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);
 return Response.json(await readPlayRules(database(),await channel(access.value.admin.id)),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'play_rules_unavailable'},{status:503})}
}
export async function POST(request:Request){
 try{const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);
 if(Number(request.headers.get('content-length'))>12000)return Response.json({error:'body_too_large'},{status:413});
 const raw=await request.text();if(raw.length>12000)return Response.json({error:'body_too_large'},{status:413});
 const body=JSON.parse(raw);if(typeof body?.content!=='string'||body.content.length>10000)return Response.json({error:'invalid_play_rules'},{status:400});
 return Response.json(await savePlayRules(database(),await channel(access.value.admin.id),access.value.admin.id,body.content),{headers:{'Cache-Control':'no-store'}})}
 catch{return Response.json({error:'play_rules_unavailable'},{status:503})}
}
