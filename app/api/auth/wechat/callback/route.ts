import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {verifyWeChatCode} from '../../../../../lib/server/wechat';
import {createMemberSession,resolveMember} from '../../../../../lib/server/members';
import {authError,setSessionCookie} from '../../../../../lib/server/auth-http';
export const runtime='nodejs';
export async function GET(request:Request){
 const url=new URL(request.url),saved=(await cookies()).get('pair_wechat_state')?.value||'';
 const [expected,encodedNext]=saved.split(':'),state=url.searchParams.get('state')||'';
 if(!expected||!state||expected.length!==state.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(state)))return NextResponse.json({ok:false,error:'oauth_state_invalid'},{status:403});
 const code=url.searchParams.get('code');if(!code)return NextResponse.json({ok:false,error:'oauth_code_missing'},{status:401});
 try{const identity=await verifyWeChatCode(code),id=await resolveMember(identity),token=await createMemberSession(id);const next=Buffer.from(encodedNext||'','base64url').toString()||'/';const safeNext=next.startsWith('/')&&!next.startsWith('//')?next:'/';const response=NextResponse.redirect(new URL(safeNext,url.origin));setSessionCookie(response,token);response.cookies.delete('pair_wechat_state');return response}catch(error){return authError(error)}
}
