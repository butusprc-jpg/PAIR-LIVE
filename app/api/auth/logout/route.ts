import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {memberCookie,sameOrigin} from '../../../../lib/server/auth-http';
import {revokeMemberSession} from '../../../../lib/server/members';
export const runtime='nodejs';
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({ok:false,error:'csrf_origin'},{status:403});const token=(await cookies()).get(memberCookie)?.value;if(token)try{await revokeMemberSession(token)}catch{}const response=NextResponse.json({ok:true});response.cookies.delete(memberCookie);return response}
