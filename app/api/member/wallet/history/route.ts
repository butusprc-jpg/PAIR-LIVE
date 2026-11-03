import {NextResponse} from 'next/server';
import {currentMember} from '../../../../../lib/server/auth-http';
import {walletModule,walletRuntimeState} from '../../../../../lib/server/wallet';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{const member=await currentMember();if(!member)return NextResponse.json({error:'not_authenticated'},{status:401,headers});const state=await walletRuntimeState();if(state!=='active')return NextResponse.json({error:state==='mismatch'?'wallet_gate_mismatch':'wallet_not_activated'},{status:503,headers});const result=await walletModule().getWalletHistory({id:member.id},member.id,{limit:100});if(!result.ok)return NextResponse.json({error:result.error},{status:503,headers});return NextResponse.json({entries:result.value},{headers})}catch{return NextResponse.json({error:'wallet_unavailable'},{status:503,headers})}}
