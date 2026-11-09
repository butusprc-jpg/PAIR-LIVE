import {NextResponse} from 'next/server';
import {verifyLineMember} from '../../../../lib/server/line';
import {createMemberSession,resolveMember} from '../../../../lib/server/members';
import {authError,sameOrigin,setSessionCookie} from '../../../../lib/server/auth-http';
import {rememberSessionSeconds,shortSessionSeconds} from '../../../../lib/server/member-session-store';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({ok:false,error:'csrf_origin'},{status:403});
 try{
  const body=await request.json() as {accessToken?:string;rememberSession?:boolean};
  const identity=await verifyLineMember(String(body?.accessToken||''));
  const id=await resolveMember(identity),remember=body.rememberSession===true,token=await createMemberSession(id,remember);
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});setSessionCookie(response,token,remember?rememberSessionSeconds:shortSessionSeconds);return response;
 }catch(error){return authError(error)}
}
