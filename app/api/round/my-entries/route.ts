import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {myRoundEntries} from '../../../../lib/rounds/store';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return NextResponse.json({error:'not_authenticated'},{status:401});return NextResponse.json({entries:await myRoundEntries(member.id)},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'entries_unavailable'},{status:503})}}
