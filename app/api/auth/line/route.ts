import {NextResponse} from 'next/server';
import {verifyLineMember} from '../../../../lib/server/line';
import {createMemberSession,resolveMember} from '../../../../lib/server/members';
import {authError,sameOrigin,setSessionCookie} from '../../../../lib/server/auth-http';
import {rememberSessionSeconds,shortSessionSeconds} from '../../../../lib/server/member-session-store';
import {RequestTiming} from '../../../../lib/server/performance-timing';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({ok:false,error:'csrf_origin'},{status:403});
 const timing=new RequestTiming();
 try{
  const body=await request.json() as {accessToken?:string;rememberSession?:boolean};
  const identity=await timing.measure('line_verify',()=>verifyLineMember(String(body?.accessToken||'')));
  const id=await timing.measure('member_query',()=>resolveMember(identity)),remember=body.rememberSession===true,token=await timing.measure('session_create',()=>createMemberSession(id,identity,remember));
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}});setSessionCookie(response,token,remember?rememberSessionSeconds:shortSessionSeconds);return response;
 }catch(error){const response=authError(error);response.headers.set('Server-Timing',timing.header());return response}
}
