import {NextResponse} from 'next/server';
import {verifyLineMember} from '../../../../lib/server/line';
import {createMemberSession,resolveMember} from '../../../../lib/server/members';
import {authError,sameOrigin,setSessionCookie} from '../../../../lib/server/auth-http';
export const runtime='nodejs';
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({ok:false,error:'csrf_origin'},{status:403});
 try{
  const body=await request.json() as {accessToken?:string};
  const identity=await verifyLineMember(String(body?.accessToken||''));
  const id=await resolveMember(identity),token=await createMemberSession(id);
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});setSessionCookie(response,token);return response;
 }catch(error){return authError(error)}
}
