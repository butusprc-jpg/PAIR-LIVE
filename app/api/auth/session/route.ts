import {NextResponse} from 'next/server';
import {currentMember} from '../../../../lib/server/auth-http';
export const runtime='nodejs';
export async function GET(){try{const member=await currentMember();if(!member)return NextResponse.json({ok:false,error:'not_authenticated'},{status:401,headers:{'Cache-Control':'no-store'}});return NextResponse.json({ok:true,member:{id:member.id,displayName:member.display_name,avatarUrl:member.avatar_url,provider:member.provider,demoPoints:member.demo_points}},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({ok:false,error:'database_not_configured'},{status:503,headers:{'Cache-Control':'no-store'}})}}
