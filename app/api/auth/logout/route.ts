import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {memberCookie,sameOrigin} from '../../../../lib/server/auth-http';
import {revokeMemberSession} from '../../../../lib/server/members';
import {memberLogoutResponse} from '../../../../lib/server/member-logout';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({ok:false,error:'csrf_origin'},{status:403});const token=(await cookies()).get(memberCookie)?.value;return memberLogoutResponse(token,memberCookie,revokeMemberSession)}
