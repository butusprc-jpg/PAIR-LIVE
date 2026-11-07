import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {changeCountdown,readCountdown} from '../../../../../lib/rounds/countdown-control';
import {RoundError} from '../../../../../lib/rounds/core';
export const runtime='nodejs';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin','operator','viewer']);if(!a.ok)return adminDenied(a.error);return Response.json(await readCountdown(database()),{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'countdown_unavailable'},{status:503})}}
export async function POST(request:Request){try{const a=await adminAccess(request,['admin','operator'],true);if(!a.ok)return adminDenied(a.error);const body=await request.json();if(body.action!=='start'&&body.action!=='stop')return Response.json({error:'invalid_countdown_action'},{status:400});return Response.json(await changeCountdown(database(),body.action,a.value.admin.id),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'countdown_unavailable'},{status:503})}}
