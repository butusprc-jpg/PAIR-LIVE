import 'server-only';
import {createAdminAuth,createPairLiveLineProvider,createPostgresAdminAdapters} from '../../modules/admin-auth';
import type {AdminAuth,AdminRole} from '../../modules/admin-auth';
import {database} from './db';
export function configuredAdminAuth():AdminAuth|null{
 const channelId=process.env.LINE_LOGIN_CHANNEL_ID,origin=process.env.ADMIN_AUTH_ORIGIN,raw=process.env.ADMIN_AUTH_ALLOWLIST_JSON;
 if(!channelId||!origin||!raw||!process.env.DATABASE_URL)return null;
 const allowlist=JSON.parse(raw);
 return createAdminAuth({channelId,origin,allowlist,environment:process.env.NODE_ENV==='production'?'production':'development',identityProvider:createPairLiveLineProvider(),...createPostgresAdminAdapters(database())});
}
export async function adminAccess(request:Request,roles:readonly AdminRole[],mutation=false){const auth=configuredAdminAuth();if(!auth)return {ok:false as const,error:'admin_not_configured' as const};return mutation?auth.requireAdminMutation(request,roles):auth.requireAdmin(request,roles)}
export function adminDenied(error:string){return Response.json({error},{status:error==='admin_not_configured'?503:403,headers:{'Cache-Control':'no-store'}})}
