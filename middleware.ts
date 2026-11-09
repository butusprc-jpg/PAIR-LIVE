import {NextResponse,type NextRequest} from 'next/server';
import {stagingApiBlocked} from './lib/server/staging-gate';

export function middleware(request:NextRequest){
 if(stagingApiBlocked(request.nextUrl.pathname,process.env))return NextResponse.json({error:'staging_external_features_disabled'},{status:503,headers:{'Cache-Control':'no-store'}});
 return NextResponse.next();
}
export const config={matcher:['/api/:path*']};
