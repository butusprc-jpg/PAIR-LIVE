import {NextResponse} from 'next/server';
// The member system has no verified admin role yet. Keep publisher token issuance closed.
// A future admin-auth task must add a server-side role check before this route can issue tokens.
export async function POST(){return NextResponse.json({error:'admin_auth_not_configured'},{status:403,headers:{'Cache-Control':'no-store'}})}
