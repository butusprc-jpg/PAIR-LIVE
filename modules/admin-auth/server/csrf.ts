import type {AdminSessionStore,ChallengePurpose} from '../types';
import {assertServerRuntime,cookie,equalToken,hashToken} from './runtime';
import {ADMIN_COOKIE,CSRF_COOKIE} from './session';
export function sameOrigin(request:Request,origin:string):boolean {
 assertServerRuntime();return request.headers.get('origin')===origin && request.headers.get('sec-fetch-site')!=='cross-site';
}
export async function consumeCsrf(request:Request,origin:string,store:AdminSessionStore,purpose:ChallengePurpose,now:number):Promise<boolean> {
 assertServerRuntime();if(!sameOrigin(request,origin))return false;
 const header=request.headers.get('x-admin-csrf')||'';const challenge=cookie(request,CSRF_COOKIE);
 if(!challenge||!equalToken(header,challenge))return false;
 const token=cookie(request,ADMIN_COOKIE);
 return store.consumeChallenge(hashToken(challenge),token?hashToken(token):null,purpose,now);
}
