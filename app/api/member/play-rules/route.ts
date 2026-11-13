import {currentMember} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readPlayRules} from '../../../../lib/play-rules/store';
export const runtime='nodejs';
export async function GET(){
 try{const member=await currentMember();if(!member)return Response.json({error:'not_authenticated'},{status:401});
 return Response.json(await readPlayRules(database(),member.provider_channel_id),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'play_rules_unavailable'},{status:503})}
}
