import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {currentRound,roundTotals} from '../../../../lib/rounds/store';
import {readCountdown} from '../../../../lib/rounds/countdown-control';
import {database} from '../../../../lib/server/db';
export const runtime='nodejs';
export async function GET(){try{if(!await currentMember())return NextResponse.json({error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store'}});const state=await currentRound();return NextResponse.json({...state,totals:state.round?await roundTotals(state.round.id):null,countdown:state.round?(await readCountdown(database(),state.round.id)).countdown:null},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'round_unavailable'},{status:503})}}
