import {createHash} from 'node:crypto';
export type VerifiedIdentity={provider:'line'|'wechat';providerUserId:string;providerChannelId:string;displayName:string;avatarUrl:string|null};
export function identityKey(i:Pick<VerifiedIdentity,'provider'|'providerUserId'|'providerChannelId'>){return `${i.provider}:${i.providerChannelId}:${i.providerUserId}`}
export function tokenHash(token:string){return createHash('sha256').update(token).digest('hex')}
export async function verifyLineAccessToken(accessToken:string,channel:string,request:typeof fetch=fetch):Promise<VerifiedIdentity>{
 if(!accessToken)throw new Error('missing_line_access_token');
 if(!channel)throw new Error('line_not_configured');
 const verifyResponse=await request(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!verifyResponse.ok)throw new Error('line_token_invalid');
 const verified=await verifyResponse.json() as {client_id?:string;expires_in?:number};
 if(verified.client_id!==channel||!verified.expires_in||verified.expires_in<=0)throw new Error('line_token_invalid');
 const profileResponse=await request('https://api.line.me/v2/profile',{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!profileResponse.ok)throw new Error('line_profile_invalid');
 const profile=await profileResponse.json() as {userId?:string;displayName?:string;pictureUrl?:string};
 if(!profile.userId||!profile.displayName)throw new Error('line_profile_invalid');
 return {provider:'line',providerUserId:profile.userId,providerChannelId:channel,displayName:profile.displayName,avatarUrl:profile.pictureUrl||null};
}
