import 'server-only';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {memberFromSession} from './members';
export const memberCookie='pair_member_session';
export function setSessionCookie(response:NextResponse,token:string){response.cookies.set(memberCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*12})}
export async function currentMember(){const token=(await cookies()).get(memberCookie)?.value;return token?memberFromSession(token):null}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');const host=request.headers.get('host');if(!origin||!host)return false;try{const parsed=new URL(origin);return (parsed.protocol==='https:'||parsed.protocol==='http:')&&parsed.host===host}catch{return false}}
export function authError(error:unknown){const code=error instanceof Error?error.message:'auth_failed';const status=code==='member_suspended'?403:code.endsWith('_not_configured')?503:code.includes('invalid')||code.includes('missing')?401:500;return NextResponse.json({ok:false,error:status===500?'auth_failed':code},{status})}
