import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {RoundError} from '../../../../../lib/rounds/core';
import {startManualRound} from '../../../../../lib/rounds/store';
import {requireConnectedOaActive} from '../../../../../lib/owner/service-gate';
import {OwnerError} from '../../../../../lib/owner/auth';
export const runtime='nodejs';
export async function POST(request:Request){try{const access=await adminAccess(request,['admin','operator'],true);if(!access.ok)return adminDenied(access.error);await requireConnectedOaActive();return Response.json(await startManualRound(access.value.admin.id),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof OwnerError)return Response.json({error:error.code},{status:error.status});if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'round_unavailable'},{status:503})}}
