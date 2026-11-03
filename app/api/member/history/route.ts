import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {memberHistory} from '../../../../lib/server/members';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return NextResponse.json({ok:false,error:'not_authenticated'},{status:401});return NextResponse.json({ok:true,history:await memberHistory(member.id)},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({ok:false,error:'history_unavailable'},{status:503})}}
