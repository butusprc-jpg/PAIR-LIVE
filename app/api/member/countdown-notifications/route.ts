import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readMemberCountdownPreference,setMemberCountdownPreference} from '../../../../lib/rounds/countdown-control';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return Response.json({error:'not_authenticated'},{status:401});return Response.json(await readMemberCountdownPreference(database(),member.id),{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'preference_unavailable'},{status:503})}}
export async function POST(request:Request){if(!sameOrigin(request))return Response.json({error:'csrf_origin'},{status:403});try{const member=await currentMember();if(!member)return Response.json({error:'not_authenticated'},{status:401});const body=await request.json();if(typeof body.enabled!=='boolean')return Response.json({error:'invalid_preference'},{status:400});return Response.json(await setMemberCountdownPreference(database(),member.id,body.enabled),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'preference_unavailable'},{status:503})}}
