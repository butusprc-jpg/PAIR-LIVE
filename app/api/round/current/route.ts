import {NextResponse} from 'next/server';
import {currentRound,roundTotals} from '../../../../lib/rounds/store';
export const runtime='nodejs';
export async function GET(){try{const state=await currentRound();return NextResponse.json({...state,totals:state.round?await roundTotals(state.round.id):null},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'round_unavailable'},{status:503})}}
