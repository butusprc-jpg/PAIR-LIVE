import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {cookies} from 'next/headers';
import {memberCookie,setSessionCookie} from '../../../../lib/server/auth-http';
import {rotateMemberSession} from '../../../../lib/server/members';
import {RequestTiming} from '../../../../lib/server/performance-timing';
export const runtime='nodejs';
export async function GET(){const timing=new RequestTiming();try{const member=await timing.measure('session_query',()=>currentMember());if(!member)return NextResponse.json({ok:false,error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}});const response=NextResponse.json({ok:true,member:{id:member.id,displayName:member.display_name,avatarUrl:member.avatar_url,provider:member.provider,demoPoints:member.demo_points}},{headers:{'Cache-Control':'no-store'}});const token=(await cookies()).get(memberCookie)?.value;if(token){const rotated=await timing.measure('session_rotate',()=>rotateMemberSession(token));if(rotated)setSessionCookie(response,rotated.token,rotated.maxAge)}response.headers.set('Server-Timing',timing.header());return response}catch{return NextResponse.json({ok:false,error:'database_not_configured'},{status:503,headers:{'Cache-Control':'no-store','Server-Timing':timing.header()}})}}
