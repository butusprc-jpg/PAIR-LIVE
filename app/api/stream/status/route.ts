import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {configuredAdapter} from '../../../../lib/stream/livekit';
export const runtime='nodejs';
export async function GET(){try{if(!await currentMember())return NextResponse.json({status:'UNAUTHORIZED'},{status:401});const adapter=configuredAdapter();return NextResponse.json({status:adapter?await adapter.status():'NOT_CONFIGURED'},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({status:'UNAVAILABLE'},{status:503})}}
