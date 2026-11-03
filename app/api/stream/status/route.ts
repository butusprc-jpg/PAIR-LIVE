import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {configuredAdapter} from '../../../../lib/stream/livekit';
import {currentRound} from '../../../../lib/rounds/store';
export const runtime='nodejs';
export async function GET(){try{if(!await currentMember())return NextResponse.json({status:'UNAUTHORIZED'},{status:401});const round=await currentRound();if(!round.round||!['OPEN','CLOSED','SCANNING','REVIEW_REQUIRED'].includes(round.round.status))return NextResponse.json({status:'OFFLINE'},{headers:{'Cache-Control':'no-store'}});const adapter=configuredAdapter();return NextResponse.json({status:adapter?await adapter.status():'NOT_CONFIGURED'},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({status:'UNAVAILABLE'},{status:503})}}
