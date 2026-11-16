import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {database} from '../../../../lib/server/db';
import {readResultAnnouncement} from '../../../../lib/rounds/result-announcement';
import {RequestTiming} from '../../../../lib/server/performance-timing';
export const runtime='nodejs';
export async function GET(){
 const timing=new RequestTiming();
 try{
  if(!await timing.measure('auth',()=>currentMember()))return NextResponse.json({error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}});
  const result=await timing.measure('result_query',()=>readResultAnnouncement(database()));
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store','Server-Timing':timing.header()}});
 }catch{return NextResponse.json({error:'result_unavailable'},{status:503,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}})}
}
