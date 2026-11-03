import {NextResponse} from 'next/server';
export async function POST(){return NextResponse.json({error:'admin_auth_not_configured'},{status:403})}
