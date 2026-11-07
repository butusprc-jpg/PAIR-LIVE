import {currentMember} from '../../../lib/server/auth-http';
import {readExternalLive} from '../../../lib/server/external-live';
export const runtime='nodejs';
export async function GET(){try{if(!await currentMember())return Response.json({error:'not_authenticated'},{status:401});const state=await readExternalLive();return Response.json({status:state.status,provider:state.status==='LIVE'?state.provider:null,embedUrl:state.status==='LIVE'?state.embedUrl:null},{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'live_unavailable'},{status:503})}}
