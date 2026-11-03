import {NextResponse} from 'next/server';
export async function GET(){return NextResponse.json({error:'admin_auth_not_configured'},{status:403,headers:{'Cache-Control':'no-store'}})}
