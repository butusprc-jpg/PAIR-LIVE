import {adminAccess,adminDenied} from '../../../../lib/server/admin-auth';
import {RoundError} from '../../../../lib/rounds/core';
import {startRoundForLive} from '../../../../lib/rounds/store';
import {readShoppingLive} from '../../../../modules/external-live/server/line-shopping';
import {database} from '../../../../lib/server/db';
import {requireConnectedOaActive} from '../../../../lib/owner/service-gate';
import {OwnerError} from '../../../../lib/owner/auth';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);const body=await request.json();const key=body?.idempotencyKey;if(typeof key!=='string'||!/^[0-9a-f-]{36}$/i.test(key))return Response.json({error:'invalid_live_start'},{status:400});await requireConnectedOaActive();const channel=(await database().query("SELECT provider_channel_id FROM admin_identities WHERE id=$1 AND provider='line' AND status='active'",[access.value.admin.id])).rows[0]?.provider_channel_id;if(!channel)return Response.json({error:'tenant_binding_missing'},{status:403});const live=await readShoppingLive(database(),channel);if(live.displayEnabled!==true)return Response.json({error:'stream_not_live'},{status:409});return Response.json(await startRoundForLive(access.value.admin.id,key),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof OwnerError)return Response.json({error:error.code},{status:error.status});if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'live_start_unavailable'},{status:503})}}
