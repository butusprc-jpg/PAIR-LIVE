import {NextResponse} from 'next/server';
import {currentMember,sameOrigin} from '../../../../lib/server/auth-http';
import {RoundError} from '../../../../lib/rounds/core';
import {submitDemoEntry} from '../../../../lib/rounds/store';
import {requireConnectedOaActive} from '../../../../lib/owner/service-gate';
import {OwnerError} from '../../../../lib/owner/auth';
import {RequestTiming} from '../../../../lib/server/performance-timing';
import {database} from '../../../../lib/server/db';
import {takeTransactionSlot,rateLimitResponse} from '../../../../lib/server/transaction-rate-limit';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({error:'csrf_origin'},{status:403});const timing=new RequestTiming();try{const member=await timing.measure('auth',()=>currentMember());if(!member)return NextResponse.json({error:'not_authenticated'},{status:401});await timing.measure('oa',()=>requireConnectedOaActive());const data=await request.json() as {roundId?:string;side?:'even'|'odd';demoPoints?:number;idempotencyKey?:string};const limit=await takeTransactionSlot(database(),'round_entry',member.id);if(!limit.allowed)return rateLimitResponse(limit.retryAfter);const result=await timing.measure('entry',()=>submitDemoEntry(member.id,String(data.roundId||''),{side:data.side!,demoPoints:data.demoPoints!,idempotencyKey:String(data.idempotencyKey||'')},timing));return NextResponse.json(result,{status:result.replayed?200:201,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}})}catch(error){if(error instanceof OwnerError)return NextResponse.json({error:error.code},{status:error.status,headers:{'Server-Timing':timing.header()}});if(error instanceof RoundError)return NextResponse.json({error:error.code},{status:error.status,headers:{'Server-Timing':timing.header()}});return NextResponse.json({error:'entry_unavailable'},{status:503,headers:{'Server-Timing':timing.header()}})}}
