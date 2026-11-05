import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {roundRuleSettings,updateRoundRule} from '../../../../../lib/rounds/store';
import type {RoundRuleKey} from '../../../../../lib/rounds/store';
import {RoundError} from '../../../../../lib/rounds/core';
export const runtime='nodejs';
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);return Response.json(await roundRuleSettings(),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'settings_unavailable'},{status:503})}}
export async function POST(request:Request){try{const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);const body=await request.json();if(!['minEntryPoints','maxEntryPoints','alertBeforeClose'].includes(body.key))return Response.json({error:'invalid_round_rule'},{status:400});return Response.json(await updateRoundRule(body.key as RoundRuleKey,body.value),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'settings_unavailable'},{status:503})}}
