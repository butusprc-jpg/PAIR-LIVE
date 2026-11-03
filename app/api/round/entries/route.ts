import {NextResponse} from 'next/server';
import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {RoundError} from '../../../../lib/rounds/core';
import {submitDemoEntry} from '../../../../lib/rounds/store';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({error:'csrf_origin'},{status:403});try{const member=await currentMember();if(!member)return NextResponse.json({error:'not_authenticated'},{status:401});const data=await request.json() as {roundId?:string;side?:'even'|'odd';demoPoints?:number;idempotencyKey?:string};const result=await submitDemoEntry(member.id,String(data.roundId||''),{side:data.side!,demoPoints:data.demoPoints!,idempotencyKey:String(data.idempotencyKey||'')});return NextResponse.json(result,{status:result.replayed?200:201,headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof RoundError)return NextResponse.json({error:error.code},{status:error.status});return NextResponse.json({error:'entry_unavailable'},{status:503})}}
