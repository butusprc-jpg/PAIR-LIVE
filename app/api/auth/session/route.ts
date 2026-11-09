import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
import {cookies} from 'next/headers';
import {memberCookie,setSessionCookie} from '../../../../lib/server/auth-http';
import {rotateMemberSession} from '../../../../lib/server/members';
import {resolveLoginOa} from '../../../../lib/owner/credential-store';
import {database} from '../../../../lib/server/db';
export const runtime='nodejs';
export async function GET(request:Request){try{const member=await currentMember();if(!member)return NextResponse.json({ok:false,error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store'}});const key=new URL(request.url).searchParams.get('oa');if(key!==null){const oa=await resolveLoginOa(database(),key);if(!oa||member.provider!=='line'||member.provider_channel_id!==oa.loginChannelId)return NextResponse.json({ok:false,error:'oa_session_mismatch'},{status:401,headers:{'Cache-Control':'no-store'}})}const response=NextResponse.json({ok:true,member:{id:member.id,displayName:member.display_name,avatarUrl:member.avatar_url,provider:member.provider,demoPoints:member.demo_points}},{headers:{'Cache-Control':'no-store'}});const token=(await cookies()).get(memberCookie)?.value;if(token){const rotated=await rotateMemberSession(token);if(rotated)setSessionCookie(response,rotated.token,rotated.maxAge)}return response}catch{return NextResponse.json({ok:false,error:'database_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}})}}
