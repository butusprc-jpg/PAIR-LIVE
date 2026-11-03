import {NextResponse} from 'next/server';
export async function GET(){return NextResponse.json({ok:false,error:'admin_not_configured'},{status:403,headers:{'Cache-Control':'no-store'}})}
