import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {currentRound,roundTotals} from '../../../../lib/rounds/store';
import {readCountdown} from '../../../../lib/rounds/countdown-control';
import {database} from '../../../../lib/server/db';
import {RequestTiming} from '../../../../lib/server/performance-timing';
export const runtime='nodejs';
export async function GET(){const timing=new RequestTiming();try{if(!await timing.measure('auth',()=>currentMember()))return NextResponse.json({error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}});const state=await timing.measure('round_query',()=>currentRound());const totals=state.round?await timing.measure('totals_query',()=>roundTotals(state.round!.id)):null;const countdown=state.round?await timing.measure('countdown_query',async()=>(await readCountdown(database(),state.round!.id)).countdown):null;return NextResponse.json({...state,totals,countdown},{headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}})}catch{return NextResponse.json({error:'round_unavailable'},{status:503,headers:{'Server-Timing':timing.header()}})}}
