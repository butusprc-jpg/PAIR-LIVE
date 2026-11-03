import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {listRoundSummaries} from '../../../../lib/evidence/history';
export const runtime='nodejs';
export async function GET(){try{if(!await currentMember())return NextResponse.json({error:'not_authenticated'},{status:401});const rounds=await listRoundSummaries();return NextResponse.json({rounds:rounds.filter(Boolean)},{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'history_unavailable'},{status:503})}}
