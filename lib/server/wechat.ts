import 'server-only';
import type {VerifiedIdentity} from '../auth-core';
export function wechatConfigured(){return Boolean(process.env.WECHAT_APP_ID&&process.env.WECHAT_APP_SECRET&&process.env.WECHAT_REDIRECT_URI)}
export async function verifyWeChatCode(code:string):Promise<VerifiedIdentity>{
 const appId=process.env.WECHAT_APP_ID,secret=process.env.WECHAT_APP_SECRET;
 if(!wechatConfigured()||!appId||!secret)throw new Error('wechat_not_configured');
 const tokenUrl=new URL('https://api.weixin.qq.com/sns/oauth2/access_token');tokenUrl.search=new URLSearchParams({appid:appId,secret,code,grant_type:'authorization_code'}).toString();
 const tokenResponse=await fetch(tokenUrl,{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!tokenResponse.ok)throw new Error('wechat_token_invalid');
 const token=await tokenResponse.json() as {access_token?:string;openid?:string;scope?:string;errcode?:number};
 if(token.errcode||!token.access_token||!token.openid)throw new Error('wechat_token_invalid');
 const profileUrl=new URL('https://api.weixin.qq.com/sns/userinfo');profileUrl.search=new URLSearchParams({access_token:token.access_token,openid:token.openid,lang:'zh_CN'}).toString();
 // snsapi_base does not grant profile access; do not claim an authenticated profile without snsapi_userinfo.
 if(!token.scope?.split(',').includes('snsapi_userinfo'))throw new Error('wechat_profile_scope_required');
 const profileResponse=await fetch(profileUrl,{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!profileResponse.ok)throw new Error('wechat_profile_invalid');
 const profile=await profileResponse.json() as {openid?:string;nickname?:string;headimgurl?:string;errcode?:number};
 if(profile.errcode||profile.openid!==token.openid||!profile.nickname)throw new Error('wechat_profile_invalid');
 return {provider:'wechat',providerUserId:token.openid,providerChannelId:appId,displayName:profile.nickname,avatarUrl:profile.headimgurl||null};
}
