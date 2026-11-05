import {NextResponse} from 'next/server';
import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {configuredAdapter} from '../../../../lib/stream/livekit';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({error:'csrf_origin'},{status:403});try{const member=await currentMember();if(!member)return NextResponse.json({error:'not_authenticated'},{status:401});const adapter=configuredAdapter();if(!adapter)return NextResponse.json({error:'stream_not_configured'},{status:503});if(await adapter.status()!=='LIVE')return NextResponse.json({error:'stream_offline'},{status:409});const result=await adapter.issueToken('viewer',`member-${member.id}`);return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'stream_unavailable'},{status:503})}}
