import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {RoundError} from '../../../../lib/rounds/core';
import {startRoundForLive} from '../../../../lib/rounds/store';
import {readExternalLive} from '../../../../lib/server/external-live';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);const body=await request.json();const key=body?.idempotencyKey;if(typeof key!=='string'||!/^[0-9a-f-]{36}$/i.test(key))return Response.json({error:'invalid_live_start'},{status:400});const live=await readExternalLive();if(live.status!=='LIVE')return Response.json({error:'stream_not_live'},{status:409});return Response.json(await startRoundForLive(access.value.admin.id,key),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'live_start_unavailable'},{status:503})}}
