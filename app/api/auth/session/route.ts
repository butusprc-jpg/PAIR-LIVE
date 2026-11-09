import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {cookies} from 'next/headers';
import {memberCookie,setSessionCookie} from '../../../../lib/server/auth-http';
import {rotateMemberSession} from '../../../../lib/server/members';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return NextResponse.json({ok:false,error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store'}});const response=NextResponse.json({ok:true,member:{id:member.id,displayName:member.display_name,avatarUrl:member.avatar_url,provider:member.provider,demoPoints:member.demo_points}},{headers:{'Cache-Control':'no-store'}});const token=(await cookies()).get(memberCookie)?.value;if(token){const rotated=await rotateMemberSession(token);if(rotated)setSessionCookie(response,rotated.token,rotated.maxAge)}return response}catch{return NextResponse.json({ok:false,error:'database_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}})}}
