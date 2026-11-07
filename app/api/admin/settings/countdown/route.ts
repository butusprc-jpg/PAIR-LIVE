import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {database} from '../../../../../lib/server/db';
import {readCountdownDuration,saveCountdownDuration} from '../../../../../lib/rounds/countdown-control';
import {RoundError} from '../../../../../lib/rounds/core';
export const runtime='nodejs';
export async function GET(request:Request){try{const a=await adminAccess(request,['admin','operator','viewer']);if(!a.ok)return adminDenied(a.error);return Response.json(await readCountdownDuration(database()),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'countdown_settings_unavailable'},{status:503})}}
export async function POST(request:Request){try{const a=await adminAccess(request,['admin'],true);if(!a.ok)return adminDenied(a.error);const body=await request.json();return Response.json(await saveCountdownDuration(database(),body.minutes),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'countdown_settings_unavailable'},{status:503})}}
