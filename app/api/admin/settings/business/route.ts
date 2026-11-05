import {adminAccess,adminDenied} from '../../../../../lib/server/admin-auth';
import {businessSettingsOverview,updateBusinessSetting} from '../../../../../lib/rounds/business-settings';
import type {BusinessSettingKey} from '../../../../../lib/rounds/business-settings';
import {RoundError} from '../../../../../lib/rounds/core';
export const runtime='nodejs';
const allowed=['sideDifferenceLimit','maxRoundPoints','minRoundPoints','adminFeeRate','shopHours'];
export async function GET(request:Request){try{const access=await adminAccess(request,['admin','operator','viewer']);if(!access.ok)return adminDenied(access.error);return Response.json(await businessSettingsOverview(),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'settings_unavailable'},{status:503})}}
export async function POST(request:Request){try{const access=await adminAccess(request,['admin'],true);if(!access.ok)return adminDenied(access.error);const body=await request.json();if(!allowed.includes(body.key))return Response.json({error:'invalid_business_setting'},{status:400});const settings=await updateBusinessSetting(body.key as BusinessSettingKey,body.value);return Response.json({settings},{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return Response.json({error:error.code},{status:error.status});return Response.json({error:'settings_unavailable'},{status:503})}}
